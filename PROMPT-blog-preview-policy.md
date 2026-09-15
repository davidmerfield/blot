# Gather preview policy into one module

## Goal

Preview policy is scattered. `req.preview` changes vhosts, template-error rendering, cache headers, comment HTML, robots.txt, CDN rewriting, iframe headers, and injected EventSource/postMessage scripts. One preview policy module would make those rules visible in one place.

Do not invent a new preview hostname parser. Call sites keep checking `req.preview` (or a helper that reads it). The module **owns the rules**; it does not become a god object that renders pages.

## Depends on / do not undo

- If `PROMPT-blog-split-vhosts.md` has landed, put header/template-id/cssURL overrides in `applyPreview` that **imports** this module. Do not duplicate iframe / no-cache rules in both places.
- If `res.renderView` has been split into `renderToString` / `sendView`, preview **scripts** stay on the HTTP send path only (not drafts, not CDN manifest). This module should export the HTML transform; `sendView` calls it.
- Draft SSE keepalive on preview hosts (`routes/draft.js`, `helper/SSE.md`) is transport, not template policy. Leave it in draft/SSE. You may *mention* it in a comment on the policy module so people know preview has a proxy timeout.

## Current call sites (every `req.preview` in `app/blog`)

| Where | What preview does |
|---|---|
| `middleware/vhosts.js` | Detect preview host; `req.preview = true`; strip `X-Frame-Options` and `Content-Security-Policy`; `Cache-Control: no-cache`; override `blog.template`; non-deployed `cssURL` / `scriptURL`; skip SSL and subdomain-to-custom-domain redirects |
| `middleware/loadTemplate.js` | If template has parse errors, send `views/template-error.html` at 400 (production still renders) |
| `render/middleware.js` | Skip folder-link CDN rewrite for HTML/CSS; inject postMessage + `EventSource('/__blot/preview/reload')` before `</body>` on HTML send; skip one-year JS/CSS `Cache-Control` |
| `routes/entry.js` | Hide plugin/comment HTML; placeholder “Comments are hidden on site previews.” |
| `routes/robots.js` | `Disallow: /` (also for non-canonical custom-domain Host — that part is **not** preview-only; leave that condition in robots.js) |
| `routes/preview-reload.js` | SSE only when `req.preview` |
| `render/retrieve/cdn.js` | Skip CDN rewriting |
| `render/retrieve/all_entries.js`, `all_tags.js`, `archives.js` | Bypass retrieve LRU (`getAllCached` comments) |

Also: `tests/vhosts.js`, `tests/error.js` (preview template parse errors), `tests/preview-reload.js`, `tests/robots.js`, `render/tests/middleware.js`.

## Recommended design

Add `app/blog/lib/previewPolicy.js` (name can vary) exporting small functions, for example:

```js
applyEmbedHeaders(res)           // strip frame-busting headers
applyNoStore(res)                // Cache-Control: no-cache
shouldForceSslRedirect(...)      // false when preview
shouldRedirectSubdomain(...)     // false when preview
shouldRewriteFolderLinks(req)    // false when preview
shouldLongCacheAssets(req)       // false when preview
shouldUseCdn(req)                // false when preview
shouldBypassRetrieveCache(req)   // true when preview
hidePluginHtml(entryHtml)        // comments placeholder
injectReloadScripts(html)        // the two </body> snippets
templateErrorPage(metadata)      // mustache of template-error.html, or null
```

Call sites import these instead of inlining the same strings/conditions. Detection of preview hosts stays in vhosts (`extractPreviewTemplate`).

Keep the two preview scripts as named constants in this module (postMessage to `window.top`, EventSource `/__blot/preview/reload`). `sendView` / current middleware injects only for `text/html` + `req.preview` + not the `renderToString` path.

Robots: preview → disallow. Non-canonical host (`req.blog.domain && req.originalHost !== req.blog.domain`) stays in `robots.js`; do not fold “wrong host” into preview policy.

## Backwards compatibility

- Template editor iframe still loads (headers stripped).
- Preview HTML still reloads on sync via EventSource; still posts `iframe:` + pathname to parent.
- Preview still noindexes via robots.txt.
- Preview still shows template parse errors; live site does not dump those errors in the body (`tests/error.js`).
- Comments/Disqus still hidden on preview and drafts (`routes/entry.js`).
- Folder files are not rewritten to CDN on preview (editor must see local paths).
- Retrieve caches still bypassed on preview so template edits show up.

## Tests

```
npm test -- \
  app/blog/tests/vhosts.js \
  app/blog/tests/error.js \
  app/blog/tests/preview-reload.js \
  app/blog/tests/robots.js \
  app/blog/tests/draft.js \
  app/blog/render/tests/middleware.js \
  app/blog/render/retrieve/tests/cdn.js \
  app/blog/render/retrieve/tests/all_entries.js \
  app/blog/render/retrieve/tests/archives.js
```

## Docs

One short “Preview policy” subsection in `app/blog/README` listing the rules and pointing at the module. Trim duplicate preview bullets elsewhere only if they would be wrong.

## Constraints

- Do not change hostname parsing.
- Do not gate `?json=1` / `?debug=1` on preview (public inspection invariant in README).
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- Every preview **rule** is defined in one module; call sites are one-liners.
- Preview detection remains in vhosts.
- Existing preview tests still pass.
