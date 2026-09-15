# One requestPath helper for blog URL decoding

## Goal

URL decoding is duplicated in entry, view, assets, and elsewhere, with slightly different `decodeURI` vs `decodeURIComponent` behavior and different handling of malformed escapes. One `requestPath(req)` helper would remove a class of encoding bugs (500s on bad `%`, double-decoding, treating query strings as paths).

## Depends on / do not undo

- If `PROMPT-blog-url-resolver.md` lands first, the resolver should call this helper. If you land first, the resolver prompt tells the next agent to use it.
- Do not change `Entry.getByUrl` internals unless a test proves the helper must own decoding end-to-end. `routes/entry.js` currently lowercases and shapes slashes, and leaves URI decoding to `getByUrl` except for canonical comparison (`decodeURI` in try/catch).

## Current call sites (blog request path, not CDN folder-link lookup)

| File | Input | Decode | Notes |
|---|---|---|---|
| `routes/entry.js` | `req.path` | none for lookup; `decodeURI` for canonical compare | strip trailing slash, ensure leading `/`, **lowercase**. Query ignored (`req.path` not `req.url`). |
| `routes/view.js` | `req.url` | `decodeURIComponent`, catch → raw | **includes query string**. Comment: special characters / `%20` / `%2F`. |
| `routes/assets.js` | `req.path` | `decodeURIComponent` **without** try/catch in several places | security check, blog static dir, folder fallbacks, `addLeadingUnderscore` decodes again |
| `tests/routing.js` | raw path `/%E0%A4%A` | — | must not 500 |
| `tests/entry.js` | malformed `%`, `%2520` | — | unicode canonical URLs, no 500 |
| `tests/assets.js` | `/%E0%A4%A.txt` | — | |

Related but **out of scope** unless a one-line comment is useful:

- `render/retrieve/active.js` `canonicalize` — per-segment `decodeURIComponent` + re-encode; query/fragment split. Different job (active matching).
- `render/replaceFolderLinks/lookupFile.js` — file paths in HTML, not the request.
- `helper/urlNormalizer.js` — pathname via `url.parse`, slash/case; **no** decode. Used by `is_active` and entry canonical `normalize()`.

`decodeURI` does not decode `%2F` / `%3F` / `%23`; `decodeURIComponent` does. Views need `%20` → space for template URL patterns (`/e g`). Entries must not turn `%2F` in a slug into a path separator if that is current getByUrl behavior — prove with existing tests before unifying.

## Recommended design

Add `app/blog/lib/requestPath.js`:

```js
function requestPath(req, { includeQuery = false } = {})
```

Contract:

1. Source: `req.path` by default (no query). View matching may pass the path Express already split, **not** `req.url` with `?…`, unless tests show `getViewByURL` needs the query (it should not; params come from the path). Prefer `req.path` for view too if `tests/routing.js` still passes — that is a bugfix, call it out in the PR body.
2. Leading `/`, no trailing `/` except empty → `/` (match entry’s slash rules where used).
3. Safe decode: try `decodeURIComponent`; on `URIError` return the undecoded path (never throw). Same as view.js catch.
4. Do not lowercase in the helper; entry keeps `.toLowerCase()` for lookup because permalinks are stored lowercase. Views may be case-sensitive in template URLs — do not lowercase for view unless tests require it.
5. Assets security check uses the decoded path for `..` / `.php` / `/.git` / NUL, and the raw path; keep both, but decode via the helper so malformed `%` does not throw.

Replace duplicated `try { decodeURIComponent` / slash trimming in entry/view/assets. Tagged uses `req.params.tag` from Express — do not decode again unless a test fails.

## Tests

Must keep passing:

```
npm test -- \
  app/blog/tests/routing.js \
  app/blog/tests/entry.js \
  app/blog/tests/assets.js \
  app/blog/tests/search.js
```

Add unit tests for `requestPath`:

- `/Foo/` → path shaping as specified
- `/%20` → decoded space
- `/%E0%A4%A` → no throw, returns something the rest of the stack can `next()`
- query string not in the path

## Docs

One line in `app/blog/README` `lib/` list.

## Constraints

- Do not “fix” encoding by switching all `decodeURI` to `decodeURIComponent` without tests for `%2F` in entry URLs.
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- Malformed escapes cannot 500 in entry/view/assets because of `decodeURIComponent`.
- One helper owns request-path decode + slash shape; call sites do not reimplement it.
- Routing/entry/assets encoding tests pass.
