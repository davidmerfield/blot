# Merge view locals before any retrieve

## Goal

Locals merge order is timing-sensitive. Routes write `res.locals` before `res.renderView` merges view locals over template/blog locals. That is why `app/blog/routes/entries.js` peeks at `getCachedFullView` and copies `page_size` / `path_prefix` / `tag` onto `res.locals` before calling `retrieve/posts`. If retrieve always ran after a complete merge, routes would not need to know about view locals.

Make that true: **one complete merge, then retrieve.** Routes choose a view and set request identity (params, query, headers). They do not load views or copy view locals.

## Depends on / do not undo

A sibling task stops listing routes from fetching data that `renderView` fetches again (alias `{{#entries}}` from `posts` / `tagged` / `search_results` after retrieve). If that has landed, keep the aliases. This task is the merge-timing half of the same bug.

A sibling task may have split `res.renderView` into `renderToString` / `sendView`. If so, put the complete merge in that pipeline **before** retrieve. Do not reintroduce a 5-tuple or callback-mode `renderView`.

## Current code (read these first)

- `app/blog/render/middleware.js` — merge happens here, **after** the route has already run:

  ```
  extend(res.locals)          // first-wins (helper/extend.js)
    .and({ query: req.query }) // only if query string nonempty
    .and(viewLocals)
    .and(req.template.locals)
    .and(blog.locals)
  ```

  Then nested `sort` is flattened to `sort_by` / `sort_order`. Then retrieve.

- `app/helper/extend.js` — **first-wins**. Route-set keys are not overwritten by view/template/blog locals. That is load-bearing (search `{{query}}` as a string must beat `req.query`; `res.locals.entry` from the entry route must stick).
- `app/blog/routes/entries.js` — the smoking gun: `getCachedFullView` then copy view locals, then `retrievePosts`, then `res.locals.entries`.
- `app/blog/render/retrieve/posts.js` — reads `res.locals.page_size` / `path_prefix` / `tag`, else `req.template.locals`. Comments describe the cache-poisoning bug if the route fetches first with the wrong page size.
- `app/blog/render/retrieve/tagged.js` — same pattern for `path_prefix` / `tagged_page_size`. The route currently fetches **before** view locals merge (`routes/tagged.js`).
- `app/blog/render/retrieve/tests/posts.js` — “respects a page_size set on the entries.html view itself”.
- `app/blog/render/retrieve/tests/tagged.js` — `"undefined"` string `path_prefix` on the tagged.html **view**.

`entries` is not a retrieve local. Top-level `{{#entries}}` does not trigger `posts`. Nested `{{#archives}}{{#months}}{{#entries}}` and `{{#tagged}}{{#entries}}` are field projections. Do not add a global `entries` retriever.

## Recommended design

1. In the render pipeline, always: load full view → merge locals (including view locals) → retrieve → augment → render.
2. Listing routes (`entries.js`, `tagged.js`, `search.js`) must not call `getCachedFullView` or retrievers. They `renderView` / `sendView` the view name. If the listing-alias work is not yet in tree, do the minimum so old `{{#entries}}` templates still get a list: after retrieve, for `entries.html` / `tagged.html` / `search.html`, ensure the canonical retriever ran even if the view did not bind it, then alias `res.locals.entries` (and tagged `tag` / `slug` / `total` / `pagination`; search `query` as a **string**). That alias is not optional if you delete the route prefetch.
3. Retrievers keep reading `res.locals.*` then `req.template.locals`. After this change, `res.locals.page_size` is already the view override when one exists.

Do not change `extend()` first-wins. Do not merge view locals in the route.

## Backwards compatibility

- View-level `page_size` on `entries.html` still wins over template-level.
- Tagged view-level `path_prefix` still filters; the `"undefined"` string prefix test still holds.
- `{{query}}` on search.html remains a joined string, not `req.query`.
- `?json=1` / `?debug=1` still dumps the fully merged `res.locals`.
- Official `{{#posts}}` / `{{#tagged}}` / `{{#search_results}}` and old `{{#entries}}` still render the same lists.

## Tests

Must keep passing:

```
npm test -- \
  app/blog/tests/entries.js \
  app/blog/tests/posts.js \
  app/blog/tests/tagged.js \
  app/blog/tests/search.js \
  app/blog/render/retrieve/tests/posts.js \
  app/blog/render/retrieve/tests/tagged.js \
  app/blog/render/retrieve/tests/search_results.js
```

`routes/entries.js` must no longer `require("../render/full-view-cache")`.

## Docs

Update `app/blog/README` only as needed to say view locals are merged before retrieve. No other README churn.

## Constraints

- Small diff. No vhosts/assets/resolver work.
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- No route peeks at `getCachedFullView` to learn `page_size` / `path_prefix` / `tag`.
- Retrieve never runs until view + template + blog locals are on `res.locals`.
- View-level listing options and old `{{#entries}}` templates still work.
