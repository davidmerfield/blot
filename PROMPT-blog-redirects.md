# Make “file beats redirect” obvious

## Goal

User redirects live in `app/blog/routes/error.js` **after** assets. That is a product choice (a file in the blog folder beats a redirect), but it is surprising because the file is named error and sits with 404/error handlers.

Make that rule obvious without changing when redirects run.

## Depends on / do not undo

- If `PROMPT-blog-url-resolver.md` is in tree, redirects are already a resolver kind after `file`. Do not re-split them into error.js. This prompt is then **done** except README if needed — do not open a PR that only moves comments.
- If the resolver is **not** in tree: extract redirects; leave 404/error in `error.js`.

## Current behavior (preserve)

`routes/error.js` first middleware:

- `Redirects.check(blog.id, req.url)` via `lib/models.checkRedirect`
- no match → `next()`
- match equals `req.url` → `next()` (no loop)
- else `res.redirect(301, redirect)`

Mounted last, after `assets` and `/random`. So:

- A file at `/foo` is served even if a redirect from `/foo` exists.
- `/random` is handled before redirects.
- 404 still records via `models/404` after redirects miss.

Covered by `app/blog/tests/error.js` (“redirects when a redirect is set”) and asset tests.

## Recommended design

New `app/blog/routes/redirects.js` exporting `register(blog)` with that one middleware. Call it from `index.js` **after** assets and `/random`, **before** `require("./routes/error")`.

`error.js` keeps 404, ENOENT HTML, template-error render, `error-bad-render.html`.

Comment in `index.js` next to the redirects mount: files and `/random` win; redirects only if nothing else matched.

Do not change 301 vs identity-skip. Do not run redirects before entry/view (an entry at that URL already wins today because redirects are last).

## Tests

```
npm test -- \
  app/blog/tests/error.js \
  app/blog/tests/assets.js \
  app/blog/tests/random.js \
  app/blog/tests/routing.js
```

If easy, add: write a file at `/gone.txt`, set redirect `/gone.txt` → `/`, request `/gone.txt` → 200 file, not 301. Only if that is not already implied by order; skip if fixtures make it awkward.

## Docs

`app/blog/README` error section: redirects are a dedicated step after assets, not “part of error handling.” One sentence on why.

## Constraints

- No resolver, no vhosts canonical redirects (those stay in vhosts).
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- `error.js` does not check `Redirects`.
- `index.js` shows assets → random → redirects → 404.
- Existing redirect and asset tests pass.
