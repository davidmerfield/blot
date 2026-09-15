# Split vhosts.js into identity, redirects, and preview

## Goal

`app/blog/middleware/vhosts.js` mixes identity, policy, and presentation: host parse, blog load, unpaid/disabled, www/handle/domain redirects, SSL, three preview hostname conventions, `Blog.extend`, and `blogURL`. Splitting “who is this blog?”, “should we redirect?”, and “is this a preview?” would make the rest of the stack smaller.

Keep one Express middleware as the public entry so `app/blog/index.js` still does `blog.use(require("./middleware/vhosts"))`. Internally, three named steps.

## Depends on / do not undo

A sibling task gathers **preview policy** (headers, robots, CDN rewrite, comment HTML, injected scripts) into one module. If that has landed, vhosts should **call** it (iframe headers, no-cache, template id, non-CDN css/js URLs) rather than inline those rules again. If it has not landed, keep preview mutation in a `applyPreview` function here; do not also invent the rest of preview policy.

Do not change product redirect behavior.

## Current code (read these first)

- `app/blog/middleware/vhosts.js` — the whole file (~200 lines)
- `app/blog/tests/vhosts.js` — handle/domain extraction, both preview hostname families, www→apex 301, HTTP→HTTPS 301, Cloudflare skip, `extractHandle` / `extractPreviewTemplate` / `isSubdomain`
- `app/blog/lib/fromCloudflare.js`
- `app/blog/lib/models.js` `getBlog`
- `models/blog` `Blog.extend`, `Blog.url.css` / `Blog.url.js`

Preview host patterns (must all keep working):

- `preview-of-{template}-on-{handle}.{host}` — SITE template
- `preview-of-my-{template}-on-{handle}.{host}` — blog-owned template
- `preview.{template}.{handle}.{host}` — legacy SITE
- `preview.my.{template}.{handle}.{host}` — legacy blog-owned

Redirect policy today (preserve status codes and skip conditions):

- Custom domain identifier that is not `blog.domain` → 301 to `blog.domain` (www→apex and similar)
- Handle identifier that is not `blog.handle` → 301 to `{handle}.{config.host}`
- Handle + `blog.domain` + `blog.redirectSubdomain` + not preview → **302** to custom domain (temporary; domain might break)
- `blog.forceSSL` + `http` + not preview + not Cloudflare → 301 to `https://{host}{originalUrl}`
- Express `res.redirect(url)` ignores prior `res.status()`; status must be passed to `redirect()` itself (see comments in vhosts.js and tests)

Identity:

- Missing `Host` → `err.code = "ENOENT"`
- No blog / `isDisabled` / `isUnpaid` → same ENOENT
- Port stripped from custom domain (tests send `host:port`)
- `req.originalHost` is the raw Host header
- After preview (or not), `Blog.extend(blog)`, then `blog.locals.blogURL` / `siteURL` from `req.protocol + "://" + req.originalHost`, then `req.blog`

## Recommended design

Keep helpers exported from `middleware/vhosts.js` (or re-export) so `tests/vhosts.js` does not churn more than needed:

- `isSubdomain(host)`
- `extractHandle(host)`
- `extractPreviewTemplate(host, blogID)`

Internal functions (same file or `middleware/vhosts/`):

1. **`parseHost(host)`** — `{ handle }` or `{ domain }` plus `previewTemplate` if the host is a preview. Parsing only; no I/O.
2. **`loadBlog(identifier)`** — `getBlog`; treat missing/disabled/unpaid as ENOENT.
3. **`canonicalRedirect(req, blog, { identifier, previewTemplate, cloudflare })`** — returns `{ status, url }` or null. The 302 subdomain-to-custom-domain branch stays 302.
4. **`applyPreview(req, res, blog, previewTemplate)`** — sets `req.preview`, iframe header removal, `Cache-Control: no-cache`, overrides `blog.template` / `cssURL` / `scriptURL`. Must run **before** `Blog.extend` (today’s comment: extend must follow preview because css/script URLs change).

The middleware becomes: parse host → load blog → maybe redirect → apply preview or `req.preview = false` → extend → blogURL → `req.blog` → next.

Do not move `blogURL` into template load. Do not change ENOENT handling in `routes/error.js`.

## Tests

```
npm test -- app/blog/tests/vhosts.js
```

Also a request that still loads a blog on handle and custom domain (any existing blog test through `tests/util/setup.js` is enough if vhosts tests stay green).

## Docs

Update the vhosts paragraph in `app/blog/README` to name the three steps. No other churn.

## Constraints

- Same redirects, same preview template IDs, same `req.blog` shape.
- Small diff. No resolver, no listing-fetch, no retrieve work.
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- A reader can find “who is this blog?”, “should we redirect?”, and “is this a preview?” as three functions.
- `tests/vhosts.js` still covers both preview conventions and both 301/302 cases.
- `index.js` still mounts a single vhosts middleware.
