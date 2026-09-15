# Drop asRetriever (and leftover renderView callback mode)

## Goal

`app/blog/lib/asRetriever.js` exists so retrieve unit tests can use `(req, res, cb)` while production `await`s. Production retrieve (`render/retrieve/index.js`) always awaits. Convert those tests to async/await and delete the wrapper.

If `res.renderView(name, next, callback)` still exists, delete that third completion path in the same spirit: drafts and the error handler should `await` a string-returning render (see sibling pipeline work). Do not keep two dual APIs.

## Depends on / do not undo

- If `res.renderView` was already split into `renderToString` / `sendView` and callback mode is gone, this task is **only** `asRetriever`.
- If callback mode is still in `render/middleware.js`, you may either:
  - depend on the pipeline split (preferred if that prompt is assigned separately), or
  - do the smallest conversion: `draft.js` and `error.js` `await` a helper that returns `{ output }` / `{ locals }` and stop passing a third argument to `renderView`. Do not fake `res.send` in CDN (`render/view.js`) if you touch that.

Do not promisify `models/` or change retrieve **behavior**.

## Current code

- `lib/asRetriever.js` — sync retrievers invoke the callback on the same tick (comment: tests that read the result immediately). Async retrievers settle via the Promise.
- Every file in `app/blog/render/retrieve/*.js` ends with `module.exports = asRetriever(fn)` except `index.js` and helpers.
- Callback-style tests (non-exhaustive; grep `function (err` under `render/retrieve/tests/`):

  - `active.js` — **sync same-tick** (`helper = value` after the call)
  - `is_active.js` — Promise wrapper around callback
  - `cdn.js`, `rgb.js`, `absoluteURLs.js`, `encodeXML.js`
  - cache tests: `posts.js`, `tagged.js`, `recent_entries.js`, `latest_entry.js`, `all_entries.js`, `allTags.js`, `archives.js`, `simpleLocals.js` (`total_posts`)

`render/retrieve/index.js` already does `await dictionary[localName](req, res)`.

`parseTemplate` / `systemRetrieveLocals.js` care about dictionary **names**, not asRetriever.

## Recommended design

1. Export the raw `async function` or sync function from each retriever: `module.exports = posts` (still attach `_createCacheKey` / `_clear` where they exist).
2. Sync retrievers can stay sync and return a value; `await syncFn()` works.
3. Rewrite tests to `const value = await retriever(req, res)`. For `active.js`, stop relying on same-tick callbacks.
4. Delete `lib/asRetriever.js` when nothing requires it (`rg asRetriever app/blog`).
5. `asRetriever` is not part of the public template API.

Do not merge snake_case/camelCase aliases. Do not change Mustache lambda return shapes (`active`, `is_active`, `cdn`, `encode_xml`, …).

## Tests

All retrieve tests plus a listing request so production still awaits:

```
npm test -- \
  app/blog/render/retrieve/tests \
  app/blog/render/tests/middleware.js \
  app/blog/tests/entries.js \
  app/blog/tests/search.js
```

If you touch `renderView` callback:

```
npm test -- app/blog/tests/draft.js app/blog/tests/error.js app/blog/tests/draft-stream-errors.js
```

## Docs

README sentence that retrievers are `(req, res) => Promise|value`. Remove asRetriever from the `lib/` tree listing.

## Constraints

- No production behavior change.
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- `asRetriever.js` is gone.
- Retrieve tests are async; no `retriever(req, res, cb)` in `app/blog`.
- No `res.renderView(name, next, callback)` unless you explicitly left pipeline work to the other prompt (then say so in the PR body).
