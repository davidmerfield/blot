# Name the catch-all URL resolver

## Goal

Catch-all matching could be one resolver. Entry, view, and assets each implement “maybe this URL is mine.” `app/blog/tests/routing.js` already states the rule: **entry, then template view, then file**. A single `resolve(req) → { kind, payload }` (`entry` | `view` | `listing` | `file` | `redirect` | `404`) would make that rule executable instead of implied by `blog.use` order.

Express can still dispatch. Named routes stay named routes. The decision for overlapping paths becomes a function.

## Depends on / do not undo

- Listing-route / locals-merge work: listing pages still render `entries.html` / `tagged.html` / `search.html` without the resolver fetching entries itself. Resolver `kind: "listing"` means “this is `/` or `/page/:page`”; render still goes through `renderView`.
- `PROMPT-blog-redirects.md`: if you implement this resolver, redirects belong **after** file matching (a file beats a user redirect). You may then skip or shrink that sibling prompt. Do not move redirects before assets.
- `PROMPT-blog-route-registration.md`: keep `index.js` readable. If you add one catch-all middleware, that is the table of contents for this part of the stack.
- `PROMPT-blog-request-path.md`: if `requestPath(req)` exists, use it. If not, do not invent a new decoder inside the resolver; call the same decode-or-fallback each current route uses.

## What must stay Express routes (not the resolver)

These match on path **before** the catch-alls and have side effects that are not “entry vs view vs file”:

- `routes/draft.js` — `/_draft`, `/_stream` (and current draft stream paths)
- `routes/preview-reload.js` — `/__blot/preview/reload`
- `routes/tagged.js` — `/tagged/:tag`, `/tagged/:tag/page/:page`
- `GET /search`
- `routes/robots.js` — `/robots.txt` (may fall through to a template view)
- `routes/verify.js`
- `GET /random` — **after** files: a file named `random` in the blog folder wins today (`index.js` mounts assets before `/random`)

Do not fold these into `resolve()` unless you can prove identical priority with tests. Prefer leaving them registered as they are.

## Current catch-all order (`app/blog/index.js`)

```
entry          // all paths; next() if no published entry
view           // all paths; next() if no template view URL
GET /page/:page, GET /   // listing
assets         // files + global static; next() if none
/random
error.js: user redirects → 404 → error handlers
```

Product notes to preserve:

- An entry whose `Link: /` intercepts the index (`routes/entry.js` comments; listing is registered after entry).
- Duplicate URL test in `tests/routing.js`: entry, then view, then file.
- Entry canonical 301 when the stored URL differs, except do not clobber `/` (`tests/entry.js`).
- User redirects in `models/redirects` only run if nothing else produced a response (`tests/error.js` “redirects when a redirect is set”). A real file at that path must still win.
- Malformed percent-encoding must not 500 (`tests/routing.js`, `tests/entry.js`, `tests/assets.js`).

## Recommended design

Add `app/blog/lib/resolvePath.js` (or `routes/resolve.js`) that, given `req` (and loaded `req.blog` / `req.template`), tries in order:

1. `entry` — same rules as `routes/entry.js` (published, not draft/deleted; scheduled only with `?scheduled`; skip index clobber). Payload: the entry, or `{ redirect }` for canonical URL.
2. `view` — `Template.getViewByURL`. Payload: `{ viewName, params }`.
3. `listing` — only if path is `/` or `/page/:page` (and `:page` is whatever `entries.js` accepts today).
4. `file` — same candidate sequence as `routes/assets.js` (do not reimplement sendFile in the resolver; either return `{ path, sendOptions }` or have the assets router stay as the implementation of this kind).
5. `redirect` — `Redirects.check`; ignore identity redirects.
6. `404`

A single `blog.use` handler switches on `kind` and calls the existing render/send functions. Delete the implied order from five separate `blog.use` lines **or** keep the files as `tryEntry` / `tryView` / … that `resolve` calls — the named function is the point.

Do **not** replace Express. Do **not** change the duplicate-URL winner.

Global static (`/fonts`, `/icons`, …) can stay as `express.static` mounts **before** the resolver if that is simpler; they are not in the entry/view/file contest. Blog-folder files are.

## Tests

Must keep passing:

```
npm test -- \
  app/blog/tests/routing.js \
  app/blog/tests/entry.js \
  app/blog/tests/assets.js \
  app/blog/tests/error.js \
  app/blog/tests/entries.js \
  app/blog/tests/random.js \
  app/blog/tests/search.js \
  app/blog/tests/tagged.js
```

Add a unit test of `resolve` (no HTTP) that encodes the routing.js rule: same path → entry, then after deleting the entry → view, then after deleting the view → file.

## Docs

Replace the “Route handlers (in priority order)” list in `app/blog/README` with the resolver kinds and the named routes that still sit outside it. State explicitly: files beat user redirects; entry beats view beats file.

## Constraints

- No behavior change. This is a naming/extraction refactor.
- Do not merge tagged/search into listing kind.
- Follow repo PR rules: no “generated with” footer, no Test plan section.

## Done when

- `tests/routing.js` is implemented by `resolve`, not only by middleware order.
- `index.js` (or one catch-all) makes the remaining stack obvious.
- Redirects are clearly “nothing else matched.”
