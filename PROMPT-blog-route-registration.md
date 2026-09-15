# One route-registration style in app/blog/index.js

## Goal

`app/blog/index.js` mixes three styles:

- `require("./routes/draft")(blog)` — register function
- `blog.get("/search", require("./routes/search"))` — path in index
- `blog.use(require("./routes/entry"))` — middleware module

Pick **one** so the file reads as a table of contents. Do not change match order or handlers.

## Depends on / do not undo

- If `PROMPT-blog-url-resolver.md` has landed, index.js may already be a short list (named routes + one resolve middleware). Only normalize what remains.
- If not, this task is **only** registration style. Do not start the resolver.

## Recommended design

Use `register(router)` everywhere (already used by draft, tagged, robots, verify, preview-reload, error). Convert the others:

- `routes/search.js` — `register(blog) { blog.get("/search", handler) }`
- `routes/entries.js` — `blog.get("/page/:page", …); blog.get("/", …)` **inside** register, keeping those two lines **after** entry and view (index still controls order if register is called in that order)
- `routes/entry.js`, `view.js`, `assets.js`, `random.js` — `register(blog) { blog.use(…) }` or `blog.use("/random", …)`

Then `index.js` is only ordered `require("./routes/…")(blog)` plus the identity middleware (log/partials, vhosts, renderView, loadTemplate).

Keep the comment about entry-before-listing (Link: `/`).

Alternative, slightly worse: everything is `blog.use(require(…))` and paths live in the modules. Either is fine; **mixing** is not. Prefer `register(blog)` because error/draft/tagged already take the router.

Do not rename files. Do not merge route modules.

## Tests

No behavior change. Run a thin slice that proves order is intact:

```
npm test -- \
  app/blog/tests/routing.js \
  app/blog/tests/search.js \
  app/blog/tests/entries.js \
  app/blog/tests/random.js \
  app/blog/tests/draft.js
```

## Docs

`app/blog/README` directory/lifecycle list can say every route file exports `register(router)`. One sentence.

## Constraints

- Zero product change. Small diff.
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- `index.js` uses a single registration style and can be read top-to-bottom as the request stack.
- Search still 404s malformed `q`; `/` still lists entries; `/random` still after files.
