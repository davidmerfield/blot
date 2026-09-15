# Clarify is vs is_active vs active

## Goal

`is`, `is_active`, and `active` are three retrieve locals with different contracts, similar names, and two different URL comparators. Make the contracts obvious in code and README. Do **not** merge them into one helper — templates use all three.

Optional, only if it is a small win: share **one** URL canonicalizer between `active` and `is_active` so they agree on trailing slashes, case, and encoding. Do not change `is` (it is not URL matching).

## The three contracts (preserve)

### `is` — `render/retrieve/is.js`

Not URLs. Builds `{ [localName]: { [stringValue]: true } }` from **string** `req.template.locals` so templates can write `{{#is.index_layout.titles}}`. Used heavily (`blog/entries.html`, `album/entries.html`, `text/entries.html`, …).

Do not add URL logic. Do not rename (Handlebars `if` collision is why it is `is`).

### `is_active` — `render/retrieve/is_active.js`

Mustache **lambda**: `{{#is_active}}/about{{/is_active}}` → `"active"` or `""`. Compares the block text to `urlNormalizer(req.url) || "/"`. Used e.g. gallery header home link: `{{#is_active}}/{{/is_active}}`.

Tests: `render/retrieve/tests/is_active.js` (trailing slash, case, empty url → `/`).

### `active` — `render/retrieve/active.js`

Mustache lambda used as a **property on the current object** (`{{#menu}}{{active}}{{/menu}}`, `{{#posts}}{{active}}`, `{{#popular_tags}}{{active}}`). Compares `req.url` to `this.url`, or to `/tagged/` + `this.slug`. Uses a local `canonicalize()`: split `?#`, per-segment `decodeURIComponent` + `encodeURIComponent` (so `%2F` in a tag slug stays one segment). Malformed escape → `false`.

Tests: `render/retrieve/tests/active.js` (encoded slashes, spaces, accents, `%3F` vs real query, menu, posts). Official templates: `{{active}}` on nav and tags everywhere.

## Recommended design

1. README retrieve table: three rows, one sentence each, with template examples. Today `is` / `is_active` are jammed into one row.
2. File-top comments: `is_active` points at `active` and says why both exist (block lambda vs current-item property).
3. Only if tests stay green: move `canonicalize` to `lib/canonicalUrl.js` (or similar) and use it from `active`. Then decide whether `is_active` should use `canonicalize` instead of `urlNormalizer`.

   Be careful: `is_active` today lowercases via `urlNormalizer`; `canonicalize` does not lowercase. Gallery `{{#is_active}}/{{/is_active}}` vs `/` must still work. Do **not** silently drop case folding for `is_active` without a test.

   If unifying comparators is not obviously safe, **do not do it**. Documentation + comments is enough for this prompt.

4. Do not add retrieve aliases (`isActive` already exists for `is_active` in the dictionary). Do not delete `is_active` even if few templates use it.

## Tests

```
npm test -- \
  app/blog/render/retrieve/tests/active.js \
  app/blog/render/retrieve/tests/is_active.js \
  app/blog/render/retrieve/tests/systemRetrieveLocals.js
```

If you change canonicalize, also hit a template that uses `{{active}}` on menu/tags (`app/blog/tests/template.js` or a small get through `tests/util/setup.js`).

## Docs

`app/blog/README` retrieve table: split `is` / `is_active` / `active`. That is the main deliverable if you skip comparator unification.

## Constraints

- Template output for official themes must not change.
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- A template author (and the next agent) can tell the three locals apart from README + file comments.
- `is` is untouched in behavior.
- `active` encoding tests still pass.
