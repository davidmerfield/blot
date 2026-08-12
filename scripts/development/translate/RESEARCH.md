# `npm run translate <url>` — Research

Research notes gathered before implementing a development script that:

1. Verifies the development server is already running, and aborts if it is not.
2. Creates a new site on the local development account.
3. Configures it for local folder editing.
4. Creates a new locally-edited template in that site's folder.
5. Acquires the content — by running an existing importer against a supplied
   platform export where one is available, otherwise by crawling `<url>`.
6. Invokes the Claude Code CLI to turn that into a **folder of content** + a
   **template** that together reproduce the source site on Blot.
7. Leaves that folder ready for the operator to review and zip by hand, so it can
   be handed to a customer who drops it into their own site folder.

Everything below was verified against the code in this repository. File paths are
repo-relative. Where the shipped documentation disagrees with the code, the code
behaviour is stated and the discrepancy flagged.

---

## 0. Executive summary of what must be built

### 0.1 The actual deliverable

**The deliverable is the site folder itself — content plus template — sitting at
`data/blogs/<blogID>/`.** The script does not archive it. The operator reviews the
result and zips the folder by hand when they are happy with it.

```
data/blogs/<blogID>/
├── README                          ← handover notes (ignored by Blot, §6.5)
├── 2024/03-12-a-post.txt           ← content, at the folder root
├── 2024/03-12-a-post/              ← (directory form when the post has assets)
│   ├── post.txt
│   └── _hero.jpg
├── Pages/
│   └── About.txt
├── .verification/                  ← screenshots + agent notes; scaffolding only
└── Templates/
    └── <slug>/
        ├── package.json            ← needs "enabled": true  (see §5.1)
        ├── README
        ├── entries.html
        ├── entry.html
        ├── style.css
        └── …
```

Dropped into a customer's own folder, that tree reproduces the site — including
installing the template, via the `"enabled": true` mechanism in §5.1. The local
dev site exists so the crawl and the template can be rendered, inspected via
`?json=true`, screenshotted and iterated on.

The two things the script still owes the operator, because they are easy to get
wrong by hand: the template's `package.json` must carry `"enabled": true` (§5.1),
and the folder must contain nothing host-specific (§5.2). `.verification/` is
scaffolding and should be deleted before zipping.

### 0.2 Phases

| Phase | What happens | Reuse | New work |
|---|---|---|---|
| A. Preflight | Confirm the dev server is up at `config.host`; abort with instructions if not | `/health` endpoints (§1.5) | reachability check |
| B. Provision | Create or reuse the blog on the local dev account, set `client: "local"`, `forceSSL: false` | `app/templates/folders/setupUser.js`, `setupBlogs.js`, `app/configure-local-blogs.js` | thin wrapper |
| C. Template scaffold | `Template.create` → `setMetadata({localEditing:true})` → `writeToFolder` → ensure `"enabled": true` | `scripts/test/setup-restore-git-test.js` is a working example | the `enabled` injection (§5.1) |
| D. Acquisition | Either run an existing importer against a supplied WordPress/Squarespace/Blogger export, or crawl `<url>` and convert HTML → Markdown + local image files | `sources/wordpress`, `sources/blogger` run directly (§3.5.2); `helper/*` waterfall for both paths | the crawler (no URL-crawl source exists yet; Are.na is the only network-sourced importer and it uses a JSON API) |
| E. Template authoring | Claude Code writes Mustache views + `package.json` + CSS into `Templates/<slug>/` | — | prompt design |
| F. Verify & iterate | Screenshot both sides, compare in a local UI, take operator feedback, resume the agent | `app/helper/screenshot`, `scripts/development/open-folder-server.js` | comparison UI + feedback loop |

The single biggest architectural fact: **both halves of the deliverable are just
files in `data/blogs/<blogID>/`**. Content files at the root, template files under
`Templates/<slug>/`. A chokidar watcher picks up every change and rebuilds —
verified end to end in §1.2. So the Claude Code CLI never needs an API; it edits a
directory, and that directory *is* the product.

---

## 1. Development environment

### 1.1 Stack layout

`scripts/development/start.sh` boots `scripts/development/docker-compose.yml`:

- `node-app` — image `blot`, Dockerfile target `dev`, runs
  `nodemon /usr/src/app/app/index.js`. Container name is `blot-node-app-1`.
- `redis` — 6.2.12-alpine, port 6379 exposed to the host.
- `toxiproxy` — injects Redis latency once the app reports readiness (disabled
  during startup and during nodemon restarts). `BLOT_USE_TOXIPROXY=false` opts out.
- `nginx` (openresty) — ports 80/443, terminates TLS for `local.blot`.

`start.sh` also runs `node scripts/development/open-folder-server.js` **on the host**
(port 3020) so the dashboard's "open folder" button can `open -R` a real Finder path.

### 1.2 Host ↔ container path mapping (critical)

From the compose file, `../../data:/usr/src/app/data` — so:

```
host:      /Volumes/Blot/blot/data/blogs/<blogID>/
container: /usr/src/app/data/blogs/<blogID>/
```

`config/index.js` sets `blog_folder_dir = BLOT_DATA_DIRECTORY + "/blogs"` and
`helper/localPath(blogID, path)` resolves to `<blog_folder_dir>/<blogID>/<path>`.

**Consequence:** the Claude Code CLI can run on the host, in
`data/blogs/<blogID>/`, and its edits are seen by the container. The
`app/clients/local` chokidar watcher will pick them up and rebuild.

**This was flagged as a risk and has now been tested empirically — it works.**
Procedure and results, run against this machine's stack:

1. Set a scratch blog to `client: "local"` and started the watcher in the master
   process by publishing to `clients:local:new-folder` (§2.4).
2. Wrote `watcher-test.txt` at the folder root **from the host**. The container
   synced it **within the same second**:
   `sync_4008d0a client=local /watcher-test.txt Saving file in database succeeded`,
   followed by `Building templates from folder` and `Updating cacheID of blog`.
3. Wrote a nested `2026/01-15-nested.txt`. Also picked up; `Entries.getAllIDs`
   returned both paths.
4. Deleted both from the host. Both were dropped:
   `/2026/01-15-nested.txt Dropping from database succeeded`.

So Docker Desktop's bind mount propagates inotify events for creates, nested
creates and deletes. **No `--rebuild` fallback is required for correctness.**

**Two caveats that do affect the design:**

- **Latency is variable.** Creates landed instantly, but the delete sync landed
  roughly half a minute after the `rm` — file events go onto a per-blog
  `async.queue`, each item takes a `proper-lockfile` lock on the folder, and syncs
  are serialised. A verification loop must therefore **wait for a settling signal
  before re-screenshotting**, not poll immediately. `blog.cacheID` is bumped at the
  end of every sync (`Updating cacheID of blog`), which makes it a usable
  "the rebuild finished" marker.
- **Deletes are soft.** `Entries.getAllIDs` still returns removed paths; the entry
  is marked `deleted: true` rather than dropped from the index (verified). Any
  check for "is this post gone" must read the flag, not the ID list.

### 1.3 Existing `npm run` script conventions

`package.json` scripts wrap either a bash file in `scripts/development/` or a
`docker exec`:

```json
"folder":  "./scripts/development/folder.sh",
"login":   "docker exec -it blot-node-app-1 /bin/sh",
"featured":"docker exec blot-node-app-1 node app/documentation/featured/build",
```

`scripts/development/folder.sh` is the closest structural precedent for the new
script: validate an argument, print usage when absent, then
`docker exec blot-node-app-1 npx nodemon app/templates/folders ... "$FOLDER_NAME"`.

Module resolution inside the container relies on `ENV NODE_PATH=/usr/src/app/app`
(Dockerfile), which is why app code does `require("models/blog")`,
`require("helper/localPath")`, `require("config")` etc. Any Node script that
touches models **must run inside the container** (or set `NODE_PATH` and have a
reachable Redis — Redis *is* exposed on host port 6379, so a host-side script is
possible but would need `BLOT_DATA_DIRECTORY` pointing at the repo `data/`).

Recommendation: keep model manipulation inside `docker exec`, and run the Claude
Code CLI on the host.

### 1.4 Config values that matter

`config/index.js`:

| Key | Dev value |
|---|---|
| `environment` | `development` (unless `NODE_ENV=production`) |
| `host` | `process.env.BLOT_HOST` — `start.sh` defaults it to `local.blot` |
| `protocol` | `https://` |
| `cdn.origin` | `https://cdn.local.blot` |
| `blog_folder_dir` | `<repo>/data/blogs` |
| `blog_static_files_dir` | `<repo>/data/static` |
| `tmp_directory` | `<repo>/data/tmp` |

Site URL is therefore `https://<handle>.local.blot`.

### 1.5 Preflight — the server must already be running

**The script does not start the stack.** It assumes `npm start` is running in
another window, and aborts with a clear message if it is not. Starting the stack
from inside `translate` would be wrong: `start.sh` is long-lived and interactive
(it tails logs, manages toxiproxy, and traps `INT`/`TERM` to save Redis and tear
down the compose project), so it cannot be composed into a one-shot script.

**Health endpoints** (both verified returning `200 OK` against the running stack):

| URL | Handler |
|---|---|
| `https://<config.host>/health` | `app/site/index.js:49` — the site vhost |
| `http://localhost:8080/health` | `app/server.js:116` — the Express catch-all, `Cache-Control: no-store` |

Check `https://<config.host>/health` rather than `localhost:8080`, because it
exercises the whole path the script actually depends on: nginx → TLS → vhost
routing → the `config.host` value the rest of the script will build URLs from.

**Local DNS and TLS on this machine** (verified):

- `/etc/resolver/blot` contains `nameserver 127.0.0.1`, so a local resolver maps
  `*.blot` — including wildcard subdomains such as `<handle>.local.blot` and
  `preview-of-x-on-y.local.blot` — to `127.0.0.1`. There is **no** `/etc/hosts`
  entry for `local.blot`; do not look for one.
- `config/openresty/setup.sh` generates a wildcard cert for `$BLOT_HOST` and
  `*.$BLOT_HOST` with `mkcert` into `data/ssl/`, and `mkcert -install` trusts it.
  It exits early if `data/ssl/certs/wildcard.crt` and `.../private/wildcard.key`
  already exist.

Because the cert is only trusted if `mkcert -install` has run on that machine, the
preflight should tolerate an untrusted cert (`curl --insecure`, or Node with
`rejectUnauthorized: false`) — a TLS trust failure is not the same as the server
being down, and shouldn't produce a misleading error.

**Suggested preflight sequence, each with its own remedy message:**

1. `docker ps` lists `blot-node-app-1` → else "the development stack is not
   running; run `npm start` in another window".
2. `GET https://<config.host>/health` returns `200` within a short timeout → else
   the same message (the container can be up while the app is still booting or
   mid-nodemon-restart, so a couple of retries with a short backoff is reasonable).
3. Optional: confirm the dev account and its blogs exist. They are created by
   `app/configure-local-blogs.js` at boot, so a successful (2) implies (3) — but
   an explicit check gives a better error than a downstream crash.

Note the `BLOT_HOST` resolution order the script must mirror: `start.sh` defaults
it to `local.blot` and passes it into compose, while `config/index.js` defaults to
`localhost` when the variable is absent. A script running on the **host** without
`BLOT_HOST` set would compute `localhost` and check the wrong URL. Read
`BLOT_HOST` from the environment with a `local.blot` default (matching
`start.sh`), or read the effective value out of the container:

```bash
docker exec blot-node-app-1 node -e 'console.log(require("config").host)'
```

The second form is authoritative and worth preferring.

---

## 2. Provisioning a site on the local development account

### 2.1 Where `example@example.com` comes from — investigated

**It is a hardcoded literal, not configuration.** `app/configure-local-blogs.js`
lines 6–7:

```js
const email = "example@example.com";
const password = "password";
```

There is no env var, no config key, and no `.env` entry behind it. It is not
`config.admin.email`, and it is not overridable without editing that file.
`grep -rn "example@example.com" app scripts config` returns only this file plus
documentation prose (`app/views/about/notes/_guides/_development-application-state.txt`,
which tells developers to run `node scripts/user/create example@example.com …`)
and a test fixture in `scripts/email/newsletter.js`.

`app/configure-local-blogs.js` runs at startup **in development only** — the
module exports `main` when `config.environment === "development"` and a no-op
otherwise. It:

- Ensures user `example@example.com` / password `password` exists
  (`User.getByEmail` → `User.hashPassword` → `User.create`).
- Creates a blog with handle `example` if the user has none.
- For every blog owned by that user: `Blog.set(blogID, { forceSSL: false, client })`
  where `client` falls back to `"local"` when unset.
- Prints the capability banner (`Local server capabilities: …`) plus a magic-link
  dashboard URL from `User.generateAccessToken`, the blog URL, and the folder path.

**The second account, for contrast.** `app/templates/folders/setupUser.js` uses:

```js
const FOLDER_ACCOUNT_EMAIL = config.admin.email || "folders@example.com";
```

`config.admin.email` is `process.env.BLOT_ADMIN_EMAIL` (`config/index.js:74`),
and **`BLOT_ADMIN_EMAIL` is not set in this repo's `.env`** — the file only
defines Stripe, PayPal, webhooks, session, Dropbox, Google Drive, iCloud and
Tumblr variables. So in practice that account is literally
`folders@example.com`, and it owns the demo folder blogs (`bjorn`, `clara`,
`david`, `documentation`, `hypertext`, `lecture`, `programmer`, `sergey`,
`thoughtforms`).

**Resolution:** attach translated sites to `example@example.com`. It is the
account `npm start` logs the developer into, it is the one whose blogs get
`client: "local"` and `forceSSL: false` applied automatically on every boot, and
keeping translated sites off `folders@example.com` avoids polluting the demo-folder
account that `app/templates/folders/index.js` manages and prints URLs for.

The script should still **look the user up rather than assume it exists**
(`User.getByEmail`, create if absent, mirroring `configure-local-blogs.js`) so it
works against a fresh Redis where the boot hook has not completed. If the email
ever needs to vary, the honest fix is to hoist the literal out of
`configure-local-blogs.js` into `config` — worth considering, but out of scope.

### 2.2 Blog creation API

`app/models/blog/create.js`:

```js
Blog.create(uid, { handle, title, timeZone, dateFormat, ... }, function (err, blog) { … })
```

- Generates `blogID` (`blog_<32 hex>` — see existing `data/blogs/` entries).
- Merges `app/models/blog/defaults.js`.
- Validates via `app/models/blog/validate/` before writing.
- `fs.emptyDir(localPath(blogID, "/"))` — creates the folder.

Relevant defaults (`app/models/blog/defaults.js`):

```js
client: "", template: "SITE:blog", timeZone: "UTC", dateFormat: "M/D/YYYY",
forceSSL: true, permalink: { format: "{{slug}}", custom: "", isCustom: false },
menu: [ Home /, Archives /archives, Search /search, Feed /feed.rss ],
plugins: build/plugins.defaultList, imageExif: "basic", cacheID: 0
```

### 2.3 Handle validation

`app/models/blog/validate/handle.js`:

- lowercased, trimmed
- `/^[a-zA-Z0-9]+$/` — **letters and digits only**, no hyphens or underscores
- 2–70 characters
- not in `app/models/blog/validate/banned.txt`
- not already taken (`err.code === "EEXISTS"`)

**Implication:** a handle derived from a URL must be aggressively sanitised.
`https://www.example.com/blog` → `examplecom` or `exampleblog`. Collisions need a
numeric suffix (still alnum-only, so `examplecom2` works).

### 2.4 Switching the blog to the local client

Two equivalent routes:

```js
Blog.set(blogID, { client: "local", forceSSL: false }, cb);
```

then run setup so the watcher starts:

```js
require("clients/local").setup(blogID, cb);   // exported for scripts/tests
```

**But that only helps inside the master process.** Calling `setup()` from a
`docker exec` starts a chokidar watcher in that short-lived process, which dies
when the process exits — verified. To make the *server* watch the folder you must
publish to the Redis channel the master process subscribes to:

```js
redisClient.publish(
  "clients:local:new-folder",
  JSON.stringify({ blogID })      // ← JSON object, NOT a bare blog ID
);
```

**The payload must be JSON.** `app/clients/local/init.js:46` does
`let { blogID } = JSON.parse(message)`. Publishing a bare ID throws
`SyntaxError: Unexpected token 'b' … is not valid JSON` in the server log and the
watcher never starts — verified by doing exactly that. Note
`app/clients/local/README` describes this only as "messages containing blog IDs",
which is what led to the mistake; the code is the contract.

`init.js` also re-initialises every `client === "local"` blog 5 s after boot, so a
server restart re-establishes all watchers regardless.

`app/clients/local/setup.js`:

- runs `sync/fix` on the blog
- **only in `config.environment === "development"`** starts a `chokidar` watcher on
  `localPath(blogID, "/")` with `ignoreInitial: true`
- every event is pushed into an `async.queue`; each item runs
  `Sync(blogID, (err, folder, done) => folder.update(path, …))`
- the watcher closes itself if `blog.client !== "local"`

`Sync` (`app/sync/index.js`) takes a `proper-lockfile` lock on the blog folder,
runs updates, then on release: checks renames, calls
`models/template.buildFromFolder(blogID)`, bumps `blog.cacheID`.

**That last point is important**: every sync also rebuilds templates from the
folder. So a content-file change and a template-file change both converge on the
same code path.

### 2.5 Reference implementations to copy

- `app/templates/folders/index.js` + `setupBlogs.js` + `setupUser.js` — the full
  "create user → create blogs → copy a source folder in → sync changed paths →
  print URLs" flow, promisified. `applyChanges()` shows how to call `sync()` and
  `folder.update()` directly rather than relying on the watcher.
- `app/templates/folders/config.js` — per-handle overrides (`title`, `template`,
  `menu`, `plugins`). Same shape the translate script will want.
- `scripts/blog/create.js` — CLI-shaped blog creation with confirmation prompt.
- `scripts/test/setup-restore-git-test.js` — creates a blog template, enables
  local editing, resolves the on-disk template directory. Near-verbatim reusable.

---

## 3. Content side — folder → entries

### 3.1 The build pipeline

`app/build/README` is thorough; summary of `build(blog, path, callback)`:

1. **Type check** — extension must match an enabled converter, else `WRONGTYPE`.
2. **Draft check** — is the file under a `Drafts` folder.
3. **Conversion** — `app/build/converters/`:
   - always available: `html` (.html/.htm), `img`, `webloc`/.url, `gdoc`
   - Pandoc-dependent (needs `config.pandoc.bin`): `markdown` (.txt/.text/.md/.markdown),
     `docx`, `odt`, `org`, `rtf`. Without Pandoc a `markdown-without-pandoc`
     fallback is used.
4. **Metadata extraction** — `app/build/metadata.js`, three accepted formats
   (§3.3).
5. **Dependency resolution** — rewrites relative `src`/`href` to blog-absolute.
6. **Plugins** — `app/build/plugins/` in series (image, wikilinks, videoEmbeds,
   codeHighlighting, imageCaption, autoImage, externalLinks, linebreaks,
   titlecase, injectTitle, typeset, katex, twitter, bluesky, flickr, zoom,
   mediaPreload, linkScreenshot, analytics, disqus).
7. **Thumbnails** — first image ≥64px; variants small/medium/large/square.
8. **Entry assembly** + `prepare/` — title, summary, teaser, slug, tags, flags,
   permalink, internal links.

`npm start` prints which converters are live:

```
- markdown with pandoc  true/false
- .docx conversion ...
```

Pandoc **is** installed in the dev image (Dockerfile installs 3.6.1), so full
Markdown is available.

### 3.2 Folder conventions (what the crawler must emit)

| Convention | Effect | Source |
|---|---|---|
| `Pages/` sub-folder | file becomes a **page**, appears on the menu | `how/sub-folders/pages.html` |
| `Drafts/` sub-folder | not published; a `.html` preview file is written next to it | `how/sub-folders/drafts.html` |
| `Templates/` (or `templates/`) sub-folder | never published; holds locally-edited templates | `app/sync/update/set.js:35` (`isTemplate`) |
| `Public/` sub-folder | served statically, never a post | `app/sync/update/set.js` (`isPublic`) |
| name starts with `_` (file *or* any path segment) | not published, still served as a static asset | `app/build/prepare/isHidden.js`, `how/ignore_file.html` |
| name starts with `.` | ignored | same |
| `[Tag]` in file name or any parent directory | adds that tag; brackets are stripped from the URL | `how/metadata.html`, `build/prepare/tags.js` |
| `YYYY/MM/DD-Name.txt`, `YYYY/MM-DD-Name.txt`, `YYYY-MM-DD-Name.txt`, `YYYY/MM/DD/Name.txt` | sets the publication date | `build/prepare/dateStamp/fromPath.js` |
| date in metadata | **overrides** any date from the path | `how/metadata.html` |
| future date | scheduled post | same |

Note the importer's own path scheme, `app/dashboard/site/import/helper/determine_path.js`:

```
page   → Pages/<slug>
draft  → Drafts/<slug>
dated  → YYYY/MM-DD-<slug>
else   → Undated/<slug>
```

slug via `helper/slugify.js` (spaces → `-`, `&` → `and`, strips `’'.,"”“#?:!`),
truncated to 150 chars, `/` → `-`.

**Adopt this scheme for the translate script** — it is already proven against
WordPress/Squarespace/Blogger/Are.na exports and lines up with Blot's date parsing.

### 3.3 Metadata block formats

All three are accepted (`app/build/metadata.js`, documented in
`app/views/how/metadata.html`):

**Bare key/value at the top of a text file** (must be followed by a blank line,
space required after the colon):

```
Date: January 1st, 2024
Tags: Getting started, Documentation
Link: /introduction

# The post title
```

**HTML comment — must start on line 1 of an `.html` file:**

```html
<!--
Date: January 1st, 2024
Link: /metadata
-->
```

**YAML front matter:**

```
---
Date: January 1st, 2024
Link: Apple
---
```

Recognised keys: `Title`, `Date`, `Link`, `Tags`, `Comments`, `Summary`,
`Search`, `Thumbnail`, `Draft`, `Page`, `Menu`, `Slug`. Anything else becomes
custom metadata available at `{{entry.metadata.<key>}}` (`/developers/guides/custom-metadata`).

`app/dashboard/site/import/helper/insert_metadata.js` shows the exact emission
order used by the existing importers:

```js
Date: YYYY-MM-DD
Tags: a, b
Link: <permalink>
Summary: <summary>
<Capitalized custom keys>: <value>

# <title>

<content>
```

### 3.4 Reusable importer helpers

`app/dashboard/site/import/helper/index.js` exports the whole toolkit. The
canonical pipeline is `helper/process.js`:

```js
async.waterfall([
  determine_path(output_directory),
  download_audio,
  download_pdfs,
  download_images,
  convert_to_markdown,
  insert_metadata,
  write,
], next)
```

Each step operates on a mutable `post` object with these fields:

`title`, `html`, `content`, `dateStamp`, `created`, `updated`, `tags[]`,
`permalink`, `summary`, `metadata{}`, `draft`, `page`, `slug`, `path`,
`asset_directory`.

Notable helpers:

- **`convert_to_markdown.js`** — Turndown + `turndown-plugin-gfm`, bullet `-`,
  fenced code, `*` emphasis, `turndown.escape` overridden to a no-op (so Markdown
  already embedded in HTML survives), keeps `audio`/`video`/`iframe`. Only runs
  when `post.content === undefined`.
- **`to_markdown.js`** — an older/alternative Turndown config that keeps
  `<figure>`, reverses footnotes into `[^n]` syntax, and has an
  `isAlreadyMarkdown()` heuristic. Not in the standard waterfall.
- **`download_images.js`** — cheerio-walks `img[src]`, `fetch`es each (actual
  timeout is 5 s; the constant's comment and the error message both say 10 s and
  are wrong), sniffs format with `sharp`,
  names the file from `Content-Disposition` → URL basename → `"image"`,
  sanitises, **prefixes with `_`** so the asset is not published as its own post,
  ensures an extension, writes into the staged asset directory, and rewrites
  `src` to the bare filename. Also handles `post.metadata.thumbnail`.
- **`asset_directory.js`** — stages assets in `os.tmpdir()/blot-import-*` so they
  do not influence final path allocation.
- **`write.js` / `write.createWriter()`** — the important one. If the post has any
  assets, it writes `<basePath>/post.txt` and moves the assets in beside it;
  otherwise `<basePath>.txt`. Reserves paths across a batch so two posts with the
  same title do not clobber each other (`-2`, `-3` suffixes). Sets `mtime` from
  `post.updated || post.created || post.dateStamp`.
- **`resolve_url.js`** — resolves all relative `href`/`src` against a base URL.
  Directly useful for a crawler.
- **`insert_video_embeds.js`**, **`replace_embeds.js`** — WordPress shortcodes and
  iframes → bare YouTube/Vimeo URLs (Blot's `videoEmbeds` plugin re-embeds them).
- **`normalize_identifier.js`** — safe human-facing names (120 chars / 240 bytes,
  strips control and unsafe chars, rejects Windows reserved names).

### 3.5 Existing importer sources (what to model the crawler on)

```
sources/wordpress   XML (WXR) → items → extract_entry → tidy → …
sources/squarespace delegates entirely to the WordPress converter
sources/blogger     Atom export
sources/arena       Are.na HTTP JSON API  ← the only network-sourced importer
```

`sources/arena/router.js` + `index.js` + `posts.js` + `parse.js` is the closest
model for a URL-driven import: validate the URL, page through a remote source,
and funnel each item through the same waterfall.

**There is no HTML-crawling importer today.** This is genuinely new work.

### 3.5.1 The HTML importer: mechanical in Node, judgement in Claude

**Design decision: the importer fetches and cleans HTML, then hands it to the
existing pipeline. Claude does the extraction and the editorial judgement.**

The split follows the existing sources exactly. Every source in the tree does the
same two things — produce a `post` object, then run it through the shared
waterfall. The HTML importer is no different; only the "produce a `post` object"
half is novel, and that half is where a model earns its keep.

**The `post` contract** (the interface between the two halves). Every field the
waterfall consumes, gathered from `extract_entry.js`, `arena/parse.js#normalizeText`
and `insert_metadata.js`:

```js
{
  title:      String,          // → "# title" appended after the metadata block
  html:       String,          // → converted to Markdown by convert_to_markdown
  content:    String,          // optional; if set, convert_to_markdown is a no-op
  dateStamp:  Number,          // ms → "Date: YYYY-MM-DD" and the YYYY/MM-DD- path
  created:    Number,          // ms
  updated:    Number,          // ms → the written file's mtime
  tags:       [String],        // → "Tags: a, b"
  permalink:  String,          // → "Link: /original/path"  (preserves inbound links)
  summary:    String,          // → "Summary: …"
  metadata:   { key: value },  // → "Key: value" per entry, capitalized
  draft:      Boolean,         // → Drafts/<slug>
  page:       Boolean,         // → Pages/<slug>
  slug:       String,          // → overrides the title when deriving the filename
}
```

Note `convert_to_markdown` only runs when `post.content === undefined`. So Claude
can hand back either raw HTML (let Turndown convert it) or finished Markdown
(set `content` directly and the pipeline passes it through). Prefer handing back
`html` — Turndown's configuration is shared with every other importer, which is
the whole point of routing through the pipeline.

**Node's half — fetch and clean:**

1. **Discovery.** Try `/sitemap.xml`, then `/feed`, `/feed.rss`, `/rss`,
   `/atom.xml`, `/index.xml`, `/feed.json`; fall back to following same-origin
   links from the homepage with a depth/page cap. `xml2js` is already a
   dependency (the WordPress and Blogger importers use it).
2. **Fetch — decided: puppeteer for every page, no fetch-first path.** Rendering
   in a real browser means the crawler sees the same DOM a reader does: JS-rendered
   content, lazy-loaded images resolved, client-side routing followed. The failure
   mode it avoids — silently capturing an empty app shell and producing a folder
   of blank posts — is the worst one available here, because it looks like success.

   **Implementation notes.** Launch **one** browser and reuse it across pages
   (`browser.newPage()` per page, close the page after), as `app/helper/screenshot`
   does; launching per page would be pathologically slow. Reuse
   `app/helper/screenshot/args.js` for the launch flags — they are already tuned
   for the Alpine container (`--no-sandbox`, `--disable-gpu`, `--disable-dev-shm`
   family). The container has Chromium at `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`
   (Dockerfile), so `crawl.js` can run in-container; **verify outbound internet
   from the container works** before relying on it, since nothing else in the tree
   fetches arbitrary external sites from there. Wait on `networkidle0` with a
   bounded timeout and treat a timeout as a soft failure — capture what rendered
   rather than dropping the page.

   Combined with serial fetching (below) this is deliberately slow. That is
   acceptable: a translation is a one-off, and correctness beats throughput.

   **Decided limits: one request at a time, no page cap, warn at 1000 pages.**
   Serial fetching is the politeness mechanism — it needs no delay tuning, it is
   trivially correct, and it keeps the load on someone else's live server to
   roughly what a single reader generates. No page cap means large archives
   translate in one pass rather than silently truncating, which is the failure
   mode that would be hardest to notice. The warning at 1000 pages is the
   backstop against a crawler that has escaped its boundary (a calendar,
   a paginated tag index, an infinite filter permutation) — print it, keep going,
   and let the operator interrupt. Consider also logging progress every N pages so
   a long crawl does not look hung.

   None of the existing importers rate-limit at all, because they consume
   user-supplied export files rather than hitting a live server; this is the first
   code in the tree that needs to be a well-behaved client.
3. **Clean.** `resolve_url.js` first (absolutises every `href`/`src` against the
   page URL — otherwise `download_images` cannot fetch anything), then strip
   scripts, styles, tracking pixels and obvious chrome with `cheerio`. Keep this
   conservative: over-stripping destroys content, and Claude can prune further.
4. **Hand off.** Emit one JSON record per page — URL, title candidates, publish
   date candidates, the cleaned HTML, and any `<meta>`/JSON-LD/microdata found.

**Claude's half — extraction and editorial judgement.** Per page: which subtree is
the actual content, what the real title and date are, whether it is a post or a
page (`Pages/`), and what tags apply. Across the whole site: the structural
decisions that a heuristic cannot make —

- **Tag strategy.** Does the source have categories, a tag cloud, section
  directories, or a topic structure implied by URLs? Blot tags can be set in
  metadata *or* in the path via `[Brackets]` (and the two are merged), so a
  section-per-directory source can become `[Section]/post.txt` and get tag pages
  at `/tagged/section` for free. This is exactly the kind of mapping worth
  spending a model on.
- **Pages vs posts.** Sites usually mix a handful of standing pages with a dated
  stream. Getting the split right drives the menu, the archives, and the homepage.
- **Landing page.** If the source homepage is bespoke rather than a post list, it
  becomes a page with `Link: /` (`how/sub-folders/pages.html`), and the post list
  moves to `/page/1`.
- **Dates.** Prefer a real publication date from the page; fall back to
  `Undated/` (`determine_path.js`) rather than inventing one.
- **Permalink preservation.** Setting `permalink` to the source path keeps inbound
  links and old URLs working. Cheap, and easy to forget.

**Why route through the pipeline rather than writing files directly:** consistency
is the point. `write.createWriter()` handles the `post.txt`-in-a-directory form
when a post has assets and reserves paths across the batch so same-titled posts do
not clobber each other; `download_images` handles `Content-Disposition` filenames,
format sniffing and the `_` asset prefix; `determine_path` produces the date-path
scheme Blot parses back out. Reimplementing any of that would drift.

**Suggested module split:**

```
crawl.js     discovery + fetch + clean → JSON records        (Node, in container)
extract.js   JSON records → post objects                     (Claude)
build.js     post objects → helper/process waterfall → files (Node, in container)
```

`app/dashboard/site/import/helper/process.js` is `build.js` almost verbatim; it
needs `preserve_output_directory: true` (it calls `fs.emptyDirSync` otherwise) and
its `process.exit()` on completion removed.

### 3.5.2 Platform exports: skip the crawl entirely

**When the source is WordPress, Squarespace or Blogger, the operator can supply
the export file and the script runs the existing importer instead of crawling.**
This is strictly better than crawling those platforms: the export carries real
publication dates, tags/categories, draft status, page-vs-post, and original
permalinks as structured data, none of which has to be inferred from rendered
HTML. Use it whenever it is available.

**Importer entry points**, all callable directly from a script — they are plain
functions and none of them depend on Express:

```js
// sources/wordpress/index.js   (also serves Squarespace — see below)
wordpress(sourceFile, outputDirectory, status, options, callback)
//   options.filter — substring match on title, useful for testing
//   status — any function; the dashboard passes an SSE publisher, a script can
//            pass console.log

// sources/blogger/index.js     async, resolves to the entry count
await blogger(sourceFile, outputDirectory, status, siteHost)
//   siteHost — used to resolve relative links in the export
```

**Squarespace needs no separate code path.** Its router
(`sources/squarespace/router.js`) does `require("../wordpress")` and calls it
unchanged — Squarespace exports WordPress WXR XML. The only difference in the
dashboard is the label and the upload copy.

**Detection.** The dashboard makes the operator pick the platform, but a script
can sniff the file, which is friendlier:

| Format | Cue |
|---|---|
| Blogger | `.atom` extension or `application/atom+xml`; content is an Atom `<feed>`. `sources/blogger/router.js#isBloggerExport` is the existing check |
| WordPress / Squarespace | `.xml`; content is `<rss>` with a `wp:wxr_version` element — `sources/wordpress/index.js` already reads `channel["wp:wxr_version"]` and logs it |

A further nicety: `crawl.js` fetches the homepage anyway, so it can read
`<meta name="generator" content="WordPress 6.x">` and *prompt* — "this looks like
WordPress, do you have an export file? [path / press enter to crawl]". Nothing in
the tree does generator sniffing today, so this is new but trivial.

**The trap: both importers wipe their output directory.**

```js
sources/wordpress/index.js:9    fs.emptyDirSync(outputDirectory);
sources/blogger/index.js:25     await fs.emptyDir(outputDirectory);
```

So they **cannot** be pointed at the blog folder root — that would destroy
`Templates/`, the `README`, and `.verification/`. Import into a staging directory
and then merge:

```
data/tmp/translate/<handle>/export.xml    ← the operator's file, copied in
data/tmp/translate/<handle>/output/       ← importer output directory
                    ↓ merge (content only, leaving Templates/ alone)
data/blogs/<blogID>/
```

`data/tmp` is the repo convention (`helper/tempDir()` → `config.tmp_directory` →
`data/tmp`), it is where the dashboard importers already stage their work, and
because `data/` is bind-mounted the operator can drop the export file in from the
host while the importer runs in the container.

**Copy the operator's file rather than reading it in place**, as the user
suggested — the dashboard does the same thing with uploads, and it means an
operator pointing at a file in `~/Downloads` does not have the run depend on that
file surviving.

**The agent still edits the output.** This is the important part: importers are
imperfect. WordPress exports carry shortcodes, inline styles, `[caption]` blocks,
and Gutenberg comment markup; `sources/wordpress/item/tidy.js` strips some of it
(`remove_caption`, `remove_embed`, `remove_inline_images`, `fix_missing_p_tags`)
but not all. The Markdown that lands in the folder is a starting point.

**Decided review depth: sample deeply, fix class-wide, re-sample.** Reading every
post scales linearly with archive size and is unaffordable on a large blog;
spot-checking misses systematic damage that never appears on a screenshotted page.
The middle path targets the actual failure shape, which is that importer artefacts
are *recurring* rather than random:

```
1. sample ~10 posts spanning types (post/page), eras, and formats
   (image-heavy, code, embeds, tables)
2. identify recurring artefacts — leftover Gutenberg comments, inline styles,
   stray shortcodes, mangled captions, broken relative links
3. write and apply a fix pass across every post
4. re-sample a different set to confirm the pass worked and introduced nothing
```

Step 3 is where committing the raw import first (§6.10) pays off: the fix pass
becomes a reviewable diff over known-original input, and a bad pass is a revert
rather than a re-import. The same procedure applies to crawler output — the phase
after acquisition is identical either way.

**So the acquisition step has three modes, converging on the same folder:**

```
                      ┌─ export file supplied → wordpress() / blogger()  ─┐
translate <url> ──────┼─ platform sniffed, operator supplies path ────────┼──→ folder
                      └─ no export → crawl.js + agent extraction ─────────┘
```

Everything downstream — agent review, template authoring, verification, the
operator's manual zip — is unchanged.

### 3.6 Entry properties available to templates

Full list in `app/views/developers/reference.yml` (rendered at `/developers/reference`).
Condensed:

**Identity/content:** `id` (= `path`), `guid`, `path`, `name`, `size`, `html`,
`body` (html minus `titleTag`), `titleTag`, `title`, `summary` (≤150 chars,
excludes headings/code), `teaser`, `teaserBody`, `more`, `slug`, `permalink`,
`index`.

**URLs:** `url`, `absoluteURL`.

**Dates:** `date` (pre-formatted, absent for pages/menu items or when
`hide_dates`), `dateStamp`, `created`, `updated`, and the lambdas `formatDate`,
`formatUpdated`, `formatCreated` (moment tokens in the block body).

**Taxonomy:** `tags[]` (`tag`, `name`, `slug`, `url`, `first`, `last`),
`tagged.<Tag>` (flat lookup object for conditionals), `backlinks[]`.

**Media:** `thumbnail.{small,medium,large,square}.{url,width,height}` (never
upscaled), `exif` (`off`/`basic`/`full` per site setting).

**Flags:** `menu`, `page`, `deleted`, `draft`, `scheduled`.

**Other:** `metadata` (custom keys, also mirrored lowercase).

---

## 4. Template side

### 4.1 Model

`app/models/template/README` is the authoritative reference (read it in full
before implementing). Key facts:

- A template is owned by a `blogID` or by the literal string `"SITE"`.
- Template ID = `<owner>:<slug>`, e.g. `SITE:blog`, `blog_abc…:mytheme`.
- All state lives in **Redis** (`template:{id}:info`, `template:{id}:view:{name}`,
  `template:{id}:all_views`, `template:{id}:url_patterns`, `template:{id}:url:{url}`).
- Metadata fields: `id name slug owner cloneFrom shareID errors previewPath
  isPublic description localEditing thumb locals cdn`.
- View fields: `name content partials locals retrieve url urlPatterns`.

### 4.2 Locally-edited templates: the lifecycle

**Enable (what the dashboard does)** — `app/dashboard/site/template/index.js`
route `/:templateSlug/local-editing` POST:

```js
Template.setMetadata(templateID, { localEditing: true }, err => {
  Template.writeToFolder(blogID, templateID, () => {});
});
```

**Disable** — `Template.removeFromFolder` then `setMetadata({localEditing:false})`.

**Write out** — `writeToFolder.js`:
- requires `isOwner(blogID, templateID)`
- picks the directory via `determineTemplateFolder` → `Templates` or `templates`
  (prefers whichever already exists; if all existing root entries are lowercase it
  chooses `templates`, else `Templates`)
- writes `Templates/<metadata.slug>/package.json` (generated by `package.generate`)
  plus one file per view named `view.name`
- **skips any view without `content`**
- removes orphaned files that are no longer views
- writes through the blog's client *and* directly with `fs.outputFile`

**Read back** — `buildFromFolder.js` → `readFromFolder.js`, called on every sync:
- scans `localPath(blogID, "/templates")` and `"/Templates"`
- for each sub-directory: create the template if missing, parse `package.json`
  (forcing `localEditing = true`), drop views whose files vanished, then
  `setView()` per file
- skips `package.json`, dotfiles, ignored files, **directories**, and files
  `> 2.5 MB`
- `view.url = view.url || "/" + view.name`
- if `package.json` has `"enabled": true` → `Blog.set(blogID, { template: id })`
- Mustache parse errors and JSON errors are captured into `metadata.errors`
  keyed by view name, with improved line/position messages, and surfaced on the
  preview subdomain
- locally-edited templates whose directory disappears are **dropped**

### 4.3 `package.json` format

Produced by `app/models/template/package.js#generate`, consumed by `#save`:

```json
{
  "name": "Blog",
  "isPublic": false,
  "enabled": true,
  "locals": { "page_size": 20, "background_color": "#FFFFFF", "…": "…" },
  "views": {
    "archives.html": {
      "url": "/archives",
      "locals": {},
      "partials": {
        "title": "Archives - {{{title}}}",
        "description": "All the entries posted on {{{title}}}"
      }
    }
  }
}
```

- `url` may be a string or an **array** of patterns; it is only emitted when it
  differs from the default `/<viewName>`.
- `partials` here are **inline string partials** scoped to that view — the
  templates use them for `<title>` and `<meta description>`.
- `locals` at the top level are template-wide; per-view `locals` are merged at
  render time.
- `enabled: true` is how a folder template installs itself as the active template.
  `removeEnabledFromAllTemplates.js` clears it from the others.

A real example is `app/templates/source/blog/package.json` (quoted in §4.7).

### 4.4 View naming and routing — the actual behaviour

`readme.txt` in `app/templates` claims "The template `foo.html` would be rendered
at the url `example.com/foo`". **This is not what the code does.**
`helper/urlNormalizer.js` only adds a leading slash, strips a trailing slash,
collapses `//`, and lowercases — it does **not** strip extensions. And
`getViewByURL.js` matches the normalized pathname against stored patterns.

So the default route for `archives.html` is `/archives.html`, which is exactly why
**every** shipped template overrides it in `package.json`:

```
album, blog, documentation, event, fieldnotes, gallery, index, journal, keynote,
links, magazine, portfolio, profile, studio, text, wireframe, zine
    → "archives.html": { "url": "/archives" }
cv        → "writing.html": { "url": "/writing" }
hypertext → "search.html": "/search", "pagination.html": "/pagination/:page"
links     → "tags.html": "/tags"
```

URL patterns go through `path-to-regexp`, so `:param` segments work
(`hypertext`'s `/pagination/:page`), and matched params land on `req.params` and
`res.locals.request.params` (`app/blog/view.js`).

**Views with hard-wired routes** (handled by dedicated route files in
`app/blog/`, not by URL patterns):

| View | Route file | URL |
|---|---|---|
| `entries.html` | `entries.js` | `/` and `/page/:page` |
| `entry.html` | `entry.js` | any URL resolving to an entry |
| `tagged.html` | `tagged.js` | `/tagged/:tag`, `/tagged/:tag/page/:page` |
| `search.html` | `search.js` | `/search?q=` |
| `error.html` | `error.js` | 404 / render failures |

Route priority in `app/blog/index.js`: vhosts → renderView middleware →
loadTemplate → draft → tagged → search → robots → **entry** → **view** →
entries → assets → random → error. Templates are matched **before** static files,
so a view URL can shadow a file in the folder.

### 4.5 Partials

- `{{> header}}` resolves to a view. `getView` tries the exact name first, then
  compares against each view name with its extension stripped — so `{{> header}}`
  finds `header.html`.
- SITE templates in `app/templates/source/` use a leading-underscore file naming
  convention (`_head.html`); `app/templates/index.js` strips the `_` when deriving
  the view name, so the stored view is `head.html` and the reference is `{{> head}}`.
  **`readFromFolder` does not strip underscores** — in a locally-edited template a
  file called `_head.html` becomes the view `_head.html`. For folder-based
  templates, name the file `header.html` and reference `{{> header}}`.
- `{{> /Pages/Home.md}}` — a partial whose name starts with `/` is looked up as an
  **entry path** and rendered as that entry's HTML (`getPartials.js`). Only
  non-deleted, non-draft, non-scheduled entries resolve.
- Inline string partials come from `package.json` `views[view].partials`.
- `setView` runs infinite-partial-cycle detection.

### 4.6 Locals available at render time

`app/blog/render/retrieve/index.js` is the whitelist. `parseTemplate.js` scans the
Mustache AST and only requests locals whose names appear in that directory.

**Site properties** (always in context): `title`, `avatar`, `roundAvatar`, `menu[]`
(`id label url metadata active first penultimate last`), `cacheID`, `updated`,
`timezone`, `siteURL`, `blogURL`, `feedURL`, `sitemapURL`.

**Retrievable locals** (snake_case canonical, camelCase aliases kept for
compatibility):

```
absolute_urls  active         all_entries    all_tags       app_css/plugin_css
app_js/plugin_js  archives    asset          avatar_url     cdn
css_url        encode_json    encode_uri_component  encode_xml
feed_url       folder         is             is_active      latest_entry
plugin         popular_tags   posts          recent_entries rgb
script_url     search_query   search_results tagged         total_posts  updated
```

`pagination` (`current previous next total page_size total_entries`) is set by
the `entries.js`/`tagged.js` route handlers. `page_size` baseline 5, valid 1–100;
tagged routes prefer `tagged_page_size`, default 100, valid 1–500.

`posts` respects template locals `sort_by`, `sort_order`, `page_size`,
`path_prefix`.

### 4.7 Anatomy of the simplest shipped template

`app/templates/source/blog/` — 15 files, the best starting point for a translated
template:

```
package.json   locals + per-view url/partials
_head.html     <head>: title/description partials, RSS link, favicon,
               preconnect + {{#cdn}}/style.css{{/cdn}}, full OG/Twitter card set
_sidebar.html  logo/avatar + {{#menu}} links
_footer.html   <script src="{{#cdn}}/script.js{{/cdn}}">
entries.html   {{#posts}} full {{{html}}} + date + tags, hr between
entry.html     {{#entry}} {{{html}}}, date, tags, {{#adjacent}} prev/next,
               {{> pluginHTML}}
archives.html  {{#archives}}{{#months}}{{#entries}} + a /search form
tagged.html    {{#entries}} + {{#pagination}} with /tagged/{{slug}}/page/N
search.html    {{#query}} / {{#entries}}
error.html     {{error.title}} / {{error.message}}
feed.rss       {{#recent_entries}} with {{#formatDate}}ddd, DD MMM YYYY HH:mm:ss ZZ{{/formatDate}}
               and {{#encode_xml}}{{{body}}}{{/encode_xml}}
sitemap.xml    {{#menu}}{{#isPage}} + {{#all_entries}}
robots.txt     Sitemap: {{{siteURL}}}/sitemap.xml
style.css      main stylesheet (Mustache-rendered — locals usable)
plugin.css     plugin styling
script.js      client JS (Mustache-rendered)
```

Its `package.json` locals:

```json
{
  "page_size": 20, "hide_dates": false, "date_display": "MMMM D, Y",
  "background_color": "#FFFFFF", "text_color": "#111111", "links_color": "#111111",
  "font": { "id": "verdana", "font_size": 11, "line_height": 1.8 },
  "title_font": { "id": "gill-sans", "font_size": 19 }
}
```

Other templates worth reading for specific patterns: `album` (photo grid +
photoswipe), `documentation` (multi-level nav, TOC, breadcrumbs, i18n),
`hypertext` (custom `:page` route, search form), `magazine` (many CSS/JS views),
`links` (list layouts), `cv`/`profile` (single-page).

### 4.8 Assets, CSS and the CDN

- **Template-owned assets** are views. CSS and JS views are rendered through
  Mustache, so `{{background_color}}` works inside `style.css`.
- Referencing them: `{{#cdn}}/style.css{{/cdn}}` produces a content-hashed CDN URL.
  `parseTemplate` statically extracts these targets into `view.retrieve.cdn`;
  `util/updateCdnManifest.js` renders, minifies, hashes, writes to
  `data/cdn/template/<h0:2>/<h2:4>/<h4:>/<basename>` and to Redis, and stores the
  `{target → hash}` map in `metadata.cdn`.
  - CDN manifests are **skipped for SITE templates** and for templates not
    currently installed on their owner blog.
  - `{{cdn}}` used as a plain variable yields the CDN origin (for `preconnect`).
- **Folder-owned assets** (images the crawler downloads) are rewritten after
  render by `app/blog/render/replaceFolderLinks/`:
  - `html.js` (parse5) rewrites `href`, `src`, `poster`, `srcset`
  - `css.js` rewrites `url(...)`
  - target form: `<cdn.origin>/folder/v-<hash>/<blogID>/<path>`
  - skipped for `req.preview` requests
- **Global static** served to every blog: `/fonts`, `/icons`, `/katex`,
  `/plugins`, `/syntax-highlighter` (`app/blog/assets.js`, one-year cache).
  `app/blog/static/layout.css` provides the classes for the Markdown layout tags.

### 4.9 Locals → dashboard controls (naming conventions)

Documented in `/developers/guides/dashboard-controls` and
`app/dashboard/site/template/load/README`. Getting these names right makes the
translated template configurable with zero extra code:

| Pattern | Control |
|---|---|
| `*_color` | color picker |
| `font`, `*_font` (except `syntax_highlighter_font`) | font picker |
| `*_url` | file upload |
| `navigation_*`, `*_navigation` | grouped navigation controls |
| `date_display`, `hide_dates` | date format select + toggle |
| `syntax_highlighter` `{ id }` (+ optional `syntax_highlighter_font`) | theme select |
| boolean value | toggle |
| `<key>` + `<key>_range: [min,max]` | slider (`page_size` always a slider) |
| `<key>` + `<key>_options: [...]` | select menu |

`app/templates/index.js` merges `body_font`/`font`/`navigation_font` with the
"System sans-serif" registry entry, `coding_font`/`syntax_highlighter_font` with
"System mono", and hydrates `syntax_highlighter` from
`blog/static/syntax-highlighter` (default `stackoverflow-light`). The same
hydration happens for blog templates via `injectLocals.js` on every metadata save.

### 4.10 Hard constraints (must be in the Claude Code prompt)

- **No subdirectories for view files.** `readFromFolder` skips directories
  outright. Everything lives in the template root.
- **No SCSS/Sass compilation.** Plain `.css` only.
- **View payload cap 2 MB** (`setView`); `readFromFolder` skips files > 2.5 MB.
- **View names** cannot contain `/` or `\` or start with `.`.
- **Avoid basename collisions** — `getView`'s extension-stripped fallback means
  `feed.xml` and `feed.rss` collide.
- Template names truncate at 100 chars, slugs at 30.
- Mustache is validated on save; failures land in `metadata.errors` and render an
  error page on the preview subdomain.
- `{{var}}` escapes HTML; use `{{{var}}}` for `url`, `path`, `html`, `body`,
  `avatar`, `siteURL` etc.
- Templates are **public**: `?json=true` / `?debug=true` exposes partial source,
  template locals and blog locals. Never put secrets in locals
  (`app/blog/README`, "Security invariant").

### 4.11 Debug and preview surfaces

- **`?json=true` or `?debug=true`** on any blog page returns the full render
  context as JSON (`app/blog/render/middleware.js:110`), `Cache-Control: no-cache`.
  This is the primary feedback loop for an agent authoring a template.
- **Preview subdomains** (`app/blog/vhosts.js`):
  - `preview-of-<template>-on-<handle>.<host>` — SITE template
  - `preview-of-my-<template>-on-<handle>.<host>` — blog-owned template
  - `preview.<template>.<handle>.<host>` — legacy
  In preview mode CDN rewriting is skipped and template parse errors render a
  dedicated error page.
- **Draft live-reload** — `GET /_draft/*` renders a draft; `GET /_stream/*` is an
  SSE stream on Redis channel `blog:{blogID}:draft:{path}`.
- **Screenshots** — `app/helper/screenshot` (puppeteer, Bottleneck-throttled,
  viewports `desktop 1260×778` / `mobile 400×650`).
  `app/templates/screenshots.js` shows the pattern: build preview URLs, capture to
  `app/views/images/examples/<template>/0.png` at 1060×780 with a 15 s timeout.
  A translate-verification step can screenshot the source URL and the local
  preview and diff them.

---

## 5. Keeping the folder portable

The script no longer produces an archive — **the operator zips the folder by hand
after reviewing it** (§0.1). But two things must be true of the folder on disk for
that manual zip to actually work in a customer's account, and both are easy to get
wrong, so the script should handle them.

### 5.1 Self-installation: `"enabled": true`

`readFromFolder.js#loadPackage` parses each template's `package.json`, forces
`localEditing = true`, and hands the parsed object to `package.save`. It then
reads the `enabled` flag off the *raw parsed package* — not off stored metadata:

```js
if (enabled === true) {
  Blog.set(blogID, { template: id }, …)   // installs the template
}
```

So a customer who copies the folder in gets the template built from disk *and*
installed as their active template, with no dashboard step. `buildFromFolder` runs
on every sync (called from `app/sync/index.js` on lock release), so this fires as
soon as their client syncs the new files.

**The gotcha — `writeToFolder` will never emit `enabled` for you.** `enabled` is
**not** in `app/models/template/metadataModel.js`. `package.save` only persists
`name`, `localEditing` and `locals`, deliberately dropping `enabled`. And
`package.generate` emits the key only `if (metadata.enabled)` — which is always
falsy for a stored template. The chain is:

```
package.json {enabled:true} → readFromFolder installs the template
                            → but `enabled` is never stored in metadata
                            → so writeToFolder regenerates package.json WITHOUT it
```

**So the script must write `"enabled": true` into the template's `package.json`
on disk itself** — read the generated file, add the key, re-serialise
(`JSON.stringify(pkg, null, 2)` matches the existing formatting). No Blot code
path will do it for you. The same omission is visible in the dashboard's own
`/:templateSlug/download-zip` route, which regenerates `package.json` via
`Template.package.generate` and likewise drops `enabled`.

**Two things can strip it back out again**, which matters now that the flag has to
survive on disk rather than being injected at packaging time:

- `Template.writeToFolder` regenerates `package.json` from stored metadata, so any
  dashboard edit or `writeChangeToFolder` call rewrites the file without `enabled`.
- `removeEnabledFromAllTemplates.js` explicitly rewrites `enabled: false` into
  every template's `package.json` whenever a different template is installed
  through the dashboard (`app/dashboard/site/template/index.js:90`).

Neither happens during a normal translate run, but both are plausible if the
operator pokes at the dashboard mid-review. **Re-assert the flag as the last step
of every run**, after the agent has finished and before handing back to the
operator, and mention it in the folder `README` so a human can restore it.

### 5.2 Portability: what must not end up in the folder

The operator zips the folder manually, so this is partly guidance for them (via
the `README`) and partly a constraint on what the agent is allowed to create.

| Item | Why | Action |
|---|---|---|
| `.verification/` | screenshots and agent notes — scaffolding, not the customer's content (§6.4) | delete before zipping; say so in the `README` |
| the agent brief, if kept in the folder | instructions to the translating agent, not to the customer | keep it in `scripts/development/translate/` and pass `--add-dir` instead (§6.8) |
| `Drafts/*.html` preview files | Blot writes a `.html` preview beside every draft (`app/sync/update/set.js` → `Preview.write`); generated artefacts | delete, or avoid creating drafts at all |
| `.DS_Store`, `._*`, `*.swp`, `~$*` | noise; some are silently skipped by Blot anyway | `clients/util/shouldIgnoreFile` already encodes the full list if you want to script the cleanup |
| `.git` and `.verification/` | both are dotfiles; Finder's select-all-then-compress excludes them automatically (§6.4, §6.10) | **nothing to do** — this is why both are dot-named. Blot also never publishes `.git`, and `/.git` is in `BLOCKED_PATTERNS` so it 404s over HTTP |
| CDN-absolute URLs (`https://cdn.local.blot/…`) | the dev host is baked in; the customer's CDN origin differs | template markup must use `{{#cdn}}/style.css{{/cdn}}` and folder-relative asset paths only, never a literal origin. `{{{cdn}}}` for `preconnect` is fine — it resolves per-blog at render time |
| Any absolute `data/blogs/<blogID>/` path | blog-ID specific | none should exist; worth grepping for before handing over |
| `Templates` vs `templates` casing | `determineTemplateFolder` prefers whichever already exists in the target folder, defaulting to `Templates` (or `templates` if every visible root entry is lowercase) | use `Templates/`. `buildFromFolder` scans **both** spellings, so either works on import |
| Template slug collisions | the customer may already have a template with that slug — `makeID` is `<blogID>:<slug>` | pick a distinctive slug from the source site, and note in the `README` that a same-slug template will be merged into |

A `grep` for `local.blot`, `cdn.local.blot` and the blog ID across the folder is a
cheap final assertion, and worth running automatically at the end of a run even
though the script is not doing the zipping.

### 5.3 Validating the result end to end

The strongest check, if it is ever wanted: **provision a second, empty blog, copy
the folder into it, let it sync, and screenshot it.** If `enabled: true` is doing
its job the second site renders identically to the first with zero configuration.
`app/templates/folders/index.js` already demonstrates every piece — create blog,
copy a source tree into `localPath(blogID, "/")`, `sync()` + `folder.update()` per
changed path, `fix()`. Not required for a first version; the operator eyeballing
the comparison UI covers the common case.

---

## 6. Wiring it together

### 6.1 Proposed shape

```
scripts/development/translate/
  RESEARCH.md          ← this file
  index.js             ← IN container: provision blog + template (idempotent)
  crawl.js             ← IN container: discovery, fetch, clean → JSON records.
                          Accepts an optional path prefix for scoped re-crawl (§6.7)
  import.js            ← IN container: detect export format, stage it, run the
                          existing wordpress/blogger importer, merge in (§3.5.2)
  build.js             ← IN container: post objects → import waterfall → files
  finalize.js          ← IN container: re-assert "enabled": true, grep for
                          host-specific strings (§5.1, §5.2)
  screenshot.js        ← ON host: puppeteer (container cannot reach *.local.blot)
  compare-server.js    ← ON host: comparison UI + feedback intake (§6.6.2)
  state.js             ← run-state read/write for idempotent re-runs (§6.7)
  translate.sh         ← host entrypoint referenced by package.json
  prompt.md            ← the Claude Code brief (content + template rules)
  README.folder.md     ← template for the folder-root README   (§6.5)
  README.template.md   ← template for the in-template README   (§6.5)
```

No packaging module: the operator zips the reviewed folder by hand (§0.1, §5).

```json
"translate": "./scripts/development/translate/translate.sh"
```

`translate.sh` — note steps 4–7 form the operator loop:

1. **preflight** — `docker ps` for `blot-node-app-1`, then
   `GET https://<host>/health`; abort with "run `npm start` in another window"
   (§1.5). Resolve the host via
   `docker exec blot-node-app-1 node -e 'console.log(require("config").host)'`.
2. validate `<url>`, derive an alnum handle, **load run state** (§6.7). On a
   re-run: print the summary and prompt immediately for optional guidance.
3. `docker exec blot-node-app-1 node scripts/development/translate <url> <handle>`
   → provisions or reuses; `git init`s the folder (§6.10); prints `blogID`,
   template slug, site URL, dashboard URL as parseable output (the existing
   `preview-newsletter.sh` greps script output the same way)
3b. **acquisition** (first run only, or on `--recrawl`) — sniff the homepage for a
   `generator` meta tag; if it looks like WordPress/Squarespace/Blogger, offer to
   take an export file path and run the existing importer, else crawl (§3.5.2).
   Commit the raw result before the agent touches it.
4. `cd data/blogs/<blogID>` and exec `claude -p …` — `--session-id` on a first run,
   `--resume` with the operator's feedback on subsequent turns (§6.3, §6.6.1).
   Non-zero exit or a `.verification/BLOCKED.txt` aborts the run.
5. wait for the rebuild to settle — poll `blog.cacheID` until stable (§1.2)
6. screenshot both sides into `.verification/` (host-side, §6.4)
7. start the comparison server on 3021 and `open` it (§6.6.2)
8. prompt: Enter accepts, text becomes feedback → back to step 4, `q` aborts
9. `docker exec blot-node-app-1 node scripts/development/translate/finalize <blogID>`
   → re-asserts `"enabled": true` (§5.1), greps for host-specific strings (§5.2)
10. persist run state; print the folder path, the site URL, the preview URL, and a
    reminder to delete `.verification/` before zipping

### 6.2 What `index.js` does (all inside the container)

```js
const user      = await getOrCreateUser("example@example.com");   // §2.1
const blog      = await Blog.create(user.uid, { handle, title });
await Blog.set(blog.id, { client: "local", forceSSL: false, timeZone, dateFormat });
await localClient.setup(blog.id);                       // starts the watcher

const template  = await Template.create(blog.id, name, { cloneFrom: "SITE:blog" });
await Template.setMetadata(template.id, { localEditing: true });
await Template.writeToFolder(blog.id, template.id);     // → Templates/<slug>/
await Blog.set(blog.id, { template: template.id });     // install it locally
```

That last `Blog.set` installs the template on the *dev* blog so it renders for
verification. It is unrelated to the customer-side install, which happens via
`"enabled": true` in the packaged `package.json` (§5.1).

**Decided: `cloneFrom: "SITE:blog"`.** The agent inherits `feed.rss`,
`sitemap.xml`, `robots.txt`, `error.html`, the full OG/Twitter meta block and a
sane `package.json` — boilerplate that is fiddly to reproduce correctly and
invisible when it is wrong (a malformed RSS feed or a missing canonical tag will
not show up in a screenshot comparison).

**The cost to manage: anchoring.** Starting from a finished-looking template
invites the agent to tweak Blot's default look rather than rebuild the source
site's. Mitigate in the brief, explicitly:

- treat the clone as **structure and plumbing, not as a design**;
- rewrite `style.css` from scratch against the source site rather than editing the
  inherited rules;
- the inherited markup in `entries.html` / `entry.html` / `_head.html` is a
  starting skeleton — restructure it freely to match the source's DOM and
  semantics.

Worth checking during verification: if the output still looks recognisably like
Blot's default `blog` template, the anchoring happened and the brief needs
sharpening.

### 6.3 Invoking the Claude Code CLI from the Node script

Yes — shell out to the `claude` binary. It is installed on this machine at
`/Users/david/.local/bin/claude`, version `2.1.47`. It must run **on the host**,
not in the container: the image has no `claude` binary and no credentials.

**Headless invocation.** `-p` / `--print` runs non-interactively and exits.
Relevant flags from `claude --help` (verified against 2.1.47):

| Flag | Use here |
|---|---|
| `-p, --print` | non-interactive; print the result and exit. Skips the workspace-trust dialog, so only point it at trusted directories |
| `--output-format json` | single structured result object — parse instead of scraping text. `stream-json` gives realtime events if you want to surface progress |
| `--permission-mode acceptEdits` | let it write files without prompting. `bypassPermissions` is broader; `plan` is read-only |
| `--allowedTools` / `--disallowedTools` | scope it, e.g. allow `Edit`, `Write`, `Read`, `Bash(curl:*)` |
| `--add-dir` | grant access outside cwd — needed if the prompt and helper scripts live in `scripts/development/translate/` while cwd is the blog folder |
| `--max-budget-usd` | hard spend ceiling; `--print` only. A sensible guard on an autonomous loop |
| `--model`, `--effort` | model and effort selection |
| `--session-id <uuid>` / `--resume` | run the content phase and the template phase as separate invocations that share context |
| `--append-system-prompt` | inject the Blot constraints without displacing the default system prompt |

**Blocking and abort semantics.** Requirement: if Claude is blocked, it must
bubble out and stop the whole script. Three layers:

1. **Process exit code.** `spawn`/`execFile` the binary and treat any non-zero
   exit as fatal. Do not swallow it — `translate.sh` should be `set -euo pipefail`
   (as every other script in `scripts/development/` already is) so the failure
   propagates.
2. **A structured refusal channel.** Exit code alone cannot distinguish "finished"
   from "gave up". Give the agent an explicit way to signal being stuck: instruct
   it to write `.verification/BLOCKED.txt` with a reason and stop. The Node
   wrapper checks for that file after the CLI returns and aborts with the reason
   as the error message. A `--json-schema` structured result would work too, but a
   file is simpler and it is also visible to the human operator.
3. **Budget and wall-clock ceilings.** `--max-budget-usd` plus a timeout on the
   spawned process, so a loop that will not converge cannot run indefinitely.

**Do not use `--dangerously-skip-permissions`** here. The agent is fetching and
processing untrusted third-party HTML, which is exactly the situation where
tool-use guardrails matter. `--permission-mode acceptEdits` with a scoped
`--allowedTools` is the right level.

**Phasing.** Content and template are different jobs with different failure modes.
Running them as two `-p` invocations sharing a `--session-id` keeps context while
letting the wrapper checkpoint between them: crawl → verify content built (entries
exist, no build errors) → template → verify visually. If phase one fails there is
no point starting phase two.

### 6.4 The verification loop and the `.verification/` folder

**Named `.verification/` — a dot-directory, deliberately.** The decisive reason is
the operator's packaging workflow: macOS Finder hides dotfiles, so opening the site
folder, pressing Cmd+A and choosing *Compress* silently excludes it. Since the
operator zips by hand (§0.1), that removes the one manual step most likely to be
forgotten. A `_verification/` name would show up in Finder and have to be deleted
every time.

Verified it behaves correctly everywhere that matters:

| Check | Result |
|---|---|
| Published as a post? | **No** — `isHidden()` returns `true` for `.verification/out.png` (it tests each path segment for a leading `_` or `.`), and `isPublic()` in `sync/update/set.js` catches any path containing `/.` |
| Served over HTTP? | **Yes** — `app/blog/assets.js` sets `dotfiles: "allow"`, and `.verification` is not in `BLOCKED_PATTERNS` (`..`, `.php`, `/.git`, `\0`). So `https://<handle>.local.blot/.verification/input-homepage.png` still works for the operator |
| Ignored by the folder watcher? | **No** — `shouldIgnoreFile(".verification/out.png")` is `false`, so writing a screenshot still triggers one sync. Harmless, but see the `cacheID` note below |
| Hidden from Finder select-all? | **Yes** — which is the point |

Note `/.git` *is* in `BLOCKED_PATTERNS`, so a shipped git repo is never exposed
over HTTP on the customer's site even though `.verification` is.

**Suggested contents:**

```
.verification/
  input-homepage.png     source site, desktop
  output-homepage.png    translated site, desktop
  input-post.png         a representative post on the source
  output-post.png        the same post translated
  input-homepage-mobile.png / output-homepage-mobile.png
  NOTES.md               what the agent changed and what it could not match
  BLOCKED.txt            written only if it gives up (see §6.3)
```

Pairing by an `input-`/`output-` prefix and a shared page label means the agent
can diff a named pair without bookkeeping, and a human can scan them side by side.

**Where puppeteer must run — verified, and it is not obvious.** The screenshot
helper is `app/helper/screenshot` (`screenshot(site, path, options)`, promise,
throws on failure). It is Bottleneck-throttled to one at a time with a 2 s minimum
gap, retries internally, restarts the browser hourly, waits for `networkidle0`
with a 20 s page timeout, and shoots at `deviceScaleFactor: 2` with
`omitBackground: true`. Viewports: `desktop 1260×778`, `mobile 400×650`
(`options.mobile`), overridable via `options.width` / `options.height`.

But **it cannot reach the dev site from inside the container.** Verified:

```
$ docker exec blot-node-app-1 getent hosts example.local.blot
127.0.0.1   example.local.blot
$ docker exec blot-node-app-1 wget -O- --no-check-certificate https://local.blot/health
wget: can't connect to remote host (127.0.0.1): Connection refused
```

Docker's embedded DNS forwards `*.blot` to the host resolver, which answers
`127.0.0.1` — correct on the host, but inside the container that is the container
itself, and nginx is a different container. So container-side screenshots of
`https://<handle>.local.blot` fail.

From the host both work:

```
$ curl -o /dev/null -w '%{http_code}' https://example.local.blot/    → 200-series routing
```

`/etc/resolver/blot` resolves the wildcard and the mkcert cert is trusted (§1.5).
The host also has its own `puppeteer` 24.1.1 in `node_modules` with a browser in
`~/.cache/puppeteer/chrome` — note `node_modules` is **not** bind-mounted into the
container (the compose file mounts only `data`, `.git`, `app`, `tests`, `notes`,
`scripts`, `TODO`, `config`), so host and container have entirely separate installs.

**So: take screenshots on the host.** Either let Claude drive puppeteer directly,
or provide a small host-side helper the agent can shell out to. Reusing
`app/helper/screenshot` from the host is possible — it only needs `puppeteer`,
`fs-extra`, `bottleneck` and `helper/clfdate` — but it would need `NODE_PATH=app`
set, and its `args.js` passes `--no-sandbox` and other flags tuned for the Alpine
container. A thin standalone wrapper is probably cleaner; the constants worth
copying are the viewports, `networkidle0`, and the retry/throttle behaviour.

`app/templates/screenshots.js` is the existing caller and shows the shape
(`fs.ensureDir(dirname(destination))`, `Promise.race` against a 15 s timeout,
catch-and-continue per shot).

**The loop.** The agent is explicitly free to change *both* sides — folder content
and template source — because a mismatch can legitimately be either. A missing
tag page is a content problem; a wrong font is a template problem; a homepage that
lists posts when the source shows a bespoke landing page is a content problem
solved with `Link: /` metadata. Constraining it to the template would force bad
workarounds.

Each iteration: screenshot both sides → compare → edit → wait for the rebuild
(§6.5) → re-screenshot. Terminate on convergence, on an iteration cap, or on
`BLOCKED.txt`. Worth also checking `?json=true` (render context) and the
template's `metadata.errors` — a Mustache error surfaces there rather than as a
visual difference.

### 6.5 The two README files

**Decision: a file named `README` — no extension — in both places, with Markdown
inside.** This matches what the codebase already does and behaves acceptably in
both locations:

- **At the folder root**, `README` is ignored entirely. Converters match on
  extension (`build/converters/markdown/index.js#is` accepts `.txt .text .md
  .markdown`); an extensionless file matches nothing, so `build` returns
  `WRONGTYPE` and `sync/update/set.js` calls `Ignore(...)`. It never becomes a
  post, and needs no underscore prefix.
- **Inside the template**, `README` becomes a view routed at `/readme`
  (`urlNormalizer` lowercases). Accepted. This is already the established
  convention — `album`, `links`, `magazine`, `portfolio`, `text`, `hypertext` and
  `profile` all ship a `README` in `app/templates/source/` today and have done so
  for years. Template source is public anyway (§4.10), so nothing leaks.

Markdown inside is fine in both: nothing parses either file, so the content is
purely for human and agent readers.

**Root `README` — for whoever edits the content.** Contents:

- What this folder is, which site it was translated from (source URL), and when.
- The folder conventions that apply to *this specific* folder: which directories
  are `Pages/`, the date-path scheme in use, which `[Bracket]` tags exist and what
  they map to on the source site, why assets carry a `_` prefix.
- The metadata block format and which keys this site actually uses.
- Where the template lives, and that editing `Templates/<slug>/` changes the design.
- Anything the translation could not reproduce, and why — this is the honest
  handover note, and the most valuable part.

**Template `README` — for whoever edits the design.** Essentially the
`AGENTS.md` brief from `/developers/guides/working-with-ai`, which Blot ships for
exactly this purpose. Contents:

- That this is a Blot template, and the Mustache rules (escaping, `{{{ }}}`,
  partials, inline `package.json` partials).
- The hard constraints from §4.10 — no subdirectories, no SCSS, 2 MB cap, no
  basename collisions.
- Which view maps to which URL, and the reminder to check `views[*].url` in
  `package.json` because the default route keeps the file extension (§4.4).
- The locals this template actually uses and where they come from.
- The `?json=true` inspection loop.
- The portability rules (§5.2): no hardcoded hosts, CDN origins, or blog IDs.

Both stay in the folder and go to the customer. Note the template `README` also
serves as the brief for the *next* agent that edits the folder, which is the point
— the deliverable carries its own onboarding.

### 6.6 Operator guidance: feedback and a comparison UI

Two mechanisms, both worth building, and they compose.

#### 6.6.1 Typed feedback between agent turns

`claude -p` returns after each invocation, so the natural shape is a loop the
operator drives:

```
run agent → screenshots → show comparison → prompt operator
   ↳ [Enter]  accept, move to packaging
   ↳ text     resume the session with that feedback, loop again
   ↳ q        abort without packaging
```

**Resuming with context is the important part.** From `claude --help` (2.1.47):
`--session-id <uuid>` pins a session on the first run, and `--resume <uuid>`
continues it with full history — so feedback like "the nav should be horizontal,
and the photo posts should be tagged" lands in a conversation that already knows
what it built and why. `--continue` resumes the most recent conversation in the
current directory and avoids tracking a UUID, but is implicit and breaks if
anything else runs `claude` in that folder. Prefer an explicit `--session-id`
stored in the run state (§6.7). Do **not** pass `--no-session-persistence`; it
disables exactly this.

**Reading the feedback.** `scripts/util/getConfirmation.js` is the existing
pattern — plain `readline.createInterface` over stdin, promise-returning with an
optional callback. It only handles y/n; a `getFeedback` sibling taking free text
(empty line = accept) is a small extension of the same shape. For longer notes,
shelling out to `$EDITOR` is an option, but a single readline prompt matches the
rest of `scripts/`.

Note this requires a TTY, so `translate.sh` must not be run in a pipeline that
detaches stdin. `npm run login` already uses `docker exec -it`, so interactive
scripts are established here.

#### 6.6.2 A local comparison UI

**Precedent:** `scripts/development/open-folder-server.js` is exactly this pattern
already — a plain `http.createServer` on a fixed port (3020), launched in the
background by `start.sh`, driving `spawn("open", …)` on macOS. A translate
comparison server can copy it wholesale. **Port 3021 is free** (verified: only
3020 and 8080 are listening locally; the project otherwise uses 80, 443, 6379,
8474 and `clients_port: 8888`).

**The framing constraint, which shapes the design.** `app/server.js:53-77` sets on
every Blot response:

```
X-Frame-Options: ALLOW-FROM <config.host>
Content-Security-Policy: frame-ancestors 'self' https://local.blot
```

So a UI served from `http://localhost:3021` **cannot** iframe
`https://<handle>.local.blot` — `frame-ancestors` does not include it, and
`ALLOW-FROM` is deprecated and ignored by modern browsers anyway, leaving CSP in
charge.

**The escape hatch:** preview subdomains strip both headers.
`app/blog/vhosts.js:100-101` calls `res.removeHeader("X-Frame-Options")` and
`res.removeHeader("Content-Security-Policy")` whenever `previewTemplate` is set,
precisely so the dashboard's template editor can embed the page. `app/blog/draft.js:86-87`
does the same for `/_draft/*`. So the local Blot site **is** iframeable at:

```
https://preview-of-my-<template-slug>-on-<handle>.local.blot/
```

`app/views/dashboard/template/js/template-editor-preview-iframe.js` is the working
implementation of that pattern — including a desktop/mobile view toggle and
`localStorage` persistence of the previewed path. Worth reading before writing a
new one.

**The target site is the harder half.** Most real sites send
`X-Frame-Options: DENY`/`SAMEORIGIN` or `frame-ancestors 'self'`, and there is no
way around that from a browser. So a live-vs-live iframe comparison will fail on a
large fraction of source sites.

**Therefore: make the UI screenshot-first.** Serve the `.verification/` PNG pairs
side by side — they always work, they are what the agent itself is comparing, and
they capture the state at the moment of the last run. Layer extras on top where
possible:

- a live iframe of the Blot side via the preview subdomain, next to the target
  screenshot;
- plain links that open each site in a real tab (always works, zero constraints);
- a slider or opacity-blend between the two PNGs, which is far better than
  side-by-side for spotting layout drift;
- a textarea that POSTs feedback back to the server, so the operator can type into
  the browser instead of the terminal — the same string then goes to
  `claude --resume`.

That last point makes the UI and the feedback loop one mechanism rather than two:
the server holds the pending feedback, the shell loop reads it, and the operator
never has to switch windows.

### 6.7 Idempotency and re-runs

**Goal: re-running `translate <url>` continues rather than starts over, and asks
for guidance up front.**

**Detecting a re-run.** Two signals, in order of reliability:

1. **A run-state file** written by the first run, keyed by source URL. Store:
   source URL, `blogID`, handle, template slug, the Claude `--session-id`, run
   count and timestamps. **Decided: `data/tmp/translate/<handle>.json`** via
   `helper/tempDir()` — where the importers already stage working state, and
   safely outside the blog folder, so it can never end up in the operator's zip.
   (`.verification/state.json` would be more discoverable to the operator and the
   agent, but it lives in the deliverable.)
2. **Handle lookup.** `Blog.get({ handle })` — `app/templates/folders/setupBlogs.js`
   is the precedent: reuse the blog if it exists, throw if it is owned by another
   user, otherwise create. That alone makes provisioning idempotent even with no
   state file.

**Re-run flow:**

```
translate <url>
  ├─ preflight (§1.5)
  ├─ state found for <url>?
  │    ├─ no  → provision, scaffold, run agent fresh with a new --session-id
  │    └─ yes → print a summary (site URL, run count, last run time)
  │             prompt immediately for optional feedback  ← the ask
  │             claude --resume <session-id> with that feedback prepended
  └─ verify → finalize (§5.1) → print folder path
```

Asking for feedback *before* doing any work on a re-run is right: the operator
already knows what they disliked, and the agent should not spend a turn
rediscovering it.

**What must be idempotent underneath:**

- **Provisioning** — reuse the blog by handle rather than creating a second one
  (`setupBlogs.js` pattern). Same for the template: `Template.create` returns
  `err.code === "EEXISTS"` if the ID already exists, so catch and reuse.
- **Content — decided: skip the crawl on re-runs by default, but support a scoped
  re-crawl when the feedback calls for one.** Most feedback is about presentation,
  and re-fetching an entire site to fix a font is waste. But some feedback is
  genuinely "the /essays section came through wrong" — so the re-crawl must be
  targetable at a subsection rather than being all-or-nothing.

  Shape:

  ```
  translate <url>                     → no crawl; agent edits content + template
  translate <url> --recrawl           → full re-crawl, content dirs cleared first
  translate <url> --recrawl /essays   → re-crawl only URLs under that path
  ```

  The agent should also be able to trigger a scoped re-crawl itself when the
  operator's feedback implies one, rather than the operator having to know to pass
  the flag. Exposing `crawl.js` as something the agent can invoke with a path
  prefix — and telling it so in the brief — covers that.

  **The mechanical trap this avoids:** `helper/process.js` calls
  `fs.emptyDirSync(output_directory)` unless `options.preserve_output_directory`
  is set, and `write.createWriter()` reserves paths and appends `-2`/`-3` suffixes
  when a target already exists. So re-crawling into a populated folder with the
  preserve flag set **duplicates every post**, while re-crawling without it
  **wipes the agent's content edits**. A scoped re-crawl must therefore delete
  exactly the paths it is about to rewrite, then run the waterfall over just those
  pages — neither of the two default behaviours is right on its own.

- **A diff-and-update precedent exists if the scoping proves fiddly**:
  `app/templates/folders/index.js` hashes every file with `helper/hashFile`,
  computes `{added, modified, removed}` against the destination, copies only the
  differences, then calls `folder.update()` for exactly those paths. Heavier than
  path-scoped deletion, but already written and known to work.
- **Templates** — `writeToFolder` removes orphaned files and skips writes whose
  content is byte-identical, so it is naturally idempotent. `buildFromFolder`
  drops locally-edited templates whose directory has disappeared.
- **Screenshots** — overwrite in place so `.verification/` always reflects the
  latest run; if history is wanted, add a run-numbered subdirectory.

**Cleanup interacts with this.** If re-runs reuse the site, sites stop
accumulating and the cleanup question (§7) mostly dissolves — one dev site per
translated URL, reused indefinitely.

### 6.8 What the Claude Code CLI is asked to do

Working directory: `data/blogs/<blogID>/`.

**Step 1 — content.** Crawl `<url>` and write Blot-compatible files at the folder
root following §3.2/§3.3, routing every page through the shared import waterfall
(§3.5.1) rather than writing files by hand. Make the structural calls: pages vs
posts, tag strategy, landing page, permalink preservation.

**Step 2 — template.** Edit `Templates/<slug>/*` so the rendered site matches the
source design, using only the locals in §4.6 and respecting §4.10.

**Step 3 — verify and iterate.** Screenshot both sides into `.verification/`,
compare, and fix — in either the content or the template (§6.4). Write
`.verification/BLOCKED.txt` and stop if genuinely stuck.

The brief handed to the CLI should extend `/developers/guides/working-with-ai`
with:
- the retrievable-locals list (§4.6)
- the entry-property list (§3.6)
- the folder conventions (§3.2) and metadata formats (§3.3)
- the `package.json` schema (§4.3) and the default-route gotcha (§4.4)
- the dashboard-control naming conventions (§4.9)
- the `post`-object contract (§3.5.1), so it feeds the pipeline rather than
  writing files directly
- **the portability rules from §5.2** — since the output ships to a customer, the
  agent must not hardcode the dev CDN origin, the dev host, or the blog ID
  anywhere in the template or content

Keep the brief in `scripts/development/translate/` and pass `--add-dir` rather
than writing it into the blog folder — otherwise it becomes part of the
deliverable the customer receives.

### 6.9 Forcing a rebuild if the watcher misses changes

Inside the container:

```js
const sync = require("sync");
sync(blogID, (err, folder, done) => {
  folder.update("/path/that/changed", () => done(null, () => {}));
});
```

`app/templates/folders/index.js#applyChanges` is a promisified working version
that also calls `sync/fix`. Templates specifically can be rebuilt with
`Template.buildFromFolder(blogID, cb)` — and `sync()` already calls it on lock
release.

### 6.10 Version-controlling the folder

**Making the blog folder a git repo and having the agent commit as it goes is a
good fit**, and the codebase already does something similar: `scripts/test/setup-restore-git-test.js`
inits a git repo *inside a blog's template directory*. The value here is concrete:

- every agent turn becomes a reviewable diff, so the operator can see exactly what
  changed between iterations rather than inferring it from screenshots;
- a bad iteration is `git revert`, not a re-run;
- the crawl/import output can be committed *before* the agent touches it, which
  cleanly separates "what the importer produced" from "what the agent fixed" —
  directly useful given §3.5.2's point that importers are imperfect;
- `git status` is a precise answer to "did the agent actually change anything".

Suggested commit points: after provisioning, after acquisition (crawl or import),
after each agent turn, and after each operator-feedback round — with the feedback
text as the commit message, which makes the log a record of the conversation.

**Blot ignores `.git` as content**, so nothing gets published:
`clients/util/shouldIgnoreFile` lists `.git` in `IGNORED_SYSTEM_FILES` (verified:
`/.git/objects/…`, `/.git/index`, `/.git/HEAD` all return `true`), and
`sync/update/set.js#isPublic` treats any path containing `/.` as a static file
rather than an entry.

**Decided: a plain `git init` in the blog folder, and the history stays local.**
The repo is a working tool for the run — diffing agent turns, separating importer
output from agent fixes, rolling back a bad iteration — not part of the handover.
The customer receives the site; the provenance stays on the operator's machine.

**This falls out of the packaging workflow for free.** The operator zips by opening
the folder in Finder, selecting all, and compressing. Finder hides dotfiles, so
`.git` is excluded by the same mechanism that excludes `.verification/` (§6.4).
Nothing to remember and nothing to clean up — the default behaviour is the correct
behaviour. (If history ever *should* be handed over, zip the folder itself rather
than its contents, and delete `.verification/` first.)

**The sync-churn problem this used to have is fixed.** `app/clients/local/setup.js`
previously watched the folder with no ignore patterns, so every `.git` internal
write ran a full sync cycle — lock, `folder.update`, rename check,
`Template.buildFromFolder`, `cacheID` bump. Commit `4d276a06a` added
`ignored: shouldIgnoreFile` to the `chokidar.watch` call. Measured before and
after on this machine:

| Operation | Before | After |
|---|---|---|
| `git init` + `add` + commit (1 file) | 42 syncs | **1** (the content file) |
| New file + commit | — | **1** |
| Empty commit, no content change | — | **0** |

The 42 were `/.git/objects/**`, `/.git/refs/**`, `/.git/logs/**`, `/.git/index`
and so on, one full cycle each. Git operations are now invisible to the watcher,
and `git init --separate-git-dir` is no longer needed as a workaround.

**Notes:**

- **Add a `.gitignore` excluding `.verification/`.** The screenshots are large
  PNGs at `deviceScaleFactor: 2`, regenerated every iteration; committing them
  churns the repo for no benefit, since the operator compares them live rather
  than historically. A dotfile at the folder root is ignored as content by
  `isPublic` (any path containing `/.`), so it costs nothing.
- **Blot never publishes or serves `.git`.** `shouldIgnoreFile` lists it in
  `IGNORED_SYSTEM_FILES` (verified for `/.git/objects/…`, `/.git/index`,
  `/.git/HEAD`), and `/.git` is in `BLOCKED_PATTERNS` in `app/blog/assets.js`, so
  it 404s over HTTP. Harmless even in the unlikely case a repo does reach a live
  site.
- **Commit messages are for the operator, not a customer** — optimise them for
  reviewing what changed between turns.

Create the repo at provisioning time so the very first acquisition is committed
against an empty tree — that is what makes "importer output vs agent fixes"
legible as a diff.

## 7. Decisions and remaining questions

### 7.1 Settled

| Question | Decision | Where |
|---|---|---|
| Dev account | `example@example.com` — a hardcoded literal, not config | §2.1 |
| Starting the stack | No. Preflight against `/health` and abort telling the operator to run `npm start` | §1.5 |
| Deliverable | The folder itself. **No zipping in the script** — the operator zips manually after review | §0.1, §5 |
| Customer install | `"enabled": true` in the template's `package.json`, written to disk and re-asserted at the end of every run | §5.1 |
| Content extraction | Node fetches and cleans, Claude extracts and makes editorial calls; they meet at the `post` object and go through the shared import waterfall | §3.5.1 |
| Crawl limits | One request at a time, no page cap, warn at 1000 pages | §3.5.1 |
| Invoking Claude | `claude -p` on the host; non-zero exit or `.verification/BLOCKED.txt` aborts the run | §6.3 |
| `.verification/` | Works as-is — `/_` paths are static files, never posts, and browsable at `/.verification/…` | §6.4 |
| READMEs | Two, both named `README`, no extension, Markdown inside. Ignored at the folder root; becomes a `/readme` view in the template, which is accepted and matches seven shipped templates | §6.5 |
| Comparison UI | Screenshot pairs + opacity-blend slider + open-in-tab links + feedback textarea, served on port 3021 | §6.6.2 |
| Feedback channel | Both — browser textarea and terminal prompt, with the server holding pending feedback the shell loop reads | §6.6 |
| Re-runs | Reuse the site by handle; prompt for guidance up front; resume the Claude session | §6.7 |
| Re-crawling | Skipped by default; `--recrawl [path]` for full or scoped re-crawl, and the agent can trigger a scoped one when feedback implies it | §6.7 |
| Watcher reliability | **Tested — works** for creates, nested creates and deletes. No `--rebuild` fallback needed | §1.2 |
| Content acquisition | Three modes converging on the same folder: supplied platform export → existing importer; sniffed platform → prompt for a path; otherwise crawl. The agent reviews and fixes the output either way | §3.5.2 |
| Version control | Yes — a **plain `git init` in the blog folder**, but **history stays local**: Finder's select-all zip excludes dotfiles, so `.git` never reaches the customer. Commit after acquisition and after every agent turn / feedback round | §6.10 |
| Verification folder | `.verification/` — dot-named so Finder select-all excludes it; still served over HTTP for the operator | §6.4 |
| Template scaffold | Clone `SITE:blog` — take the working boilerplate, and instruct the agent to treat it as structure, not as a look | §6.2 |
| Crawler rendering | Puppeteer for every page; no fetch-first path | §3.5.1 |
| Importer review | Sample deeply, fix class-wide, re-sample — not per-post reading | §3.5.2 |
| Site accumulation | Not a problem; re-runs reuse the site | §6.7 |

### 7.2 Defaults taken (say so if you disagree)

| # | Question | Default |
|---|---|---|
| 1 | Run-state location | `data/tmp/translate/<handle>.json` via `helper/tempDir()` — outside the blog folder so it can never end up in the operator's zip |
| 2 | Handle derivation | Deterministic from the URL: strip scheme, `www.` and TLD, lowercase, strip to alnum, numeric suffix on collision. Must be stable across runs or re-run detection breaks |
| 3 | Rebuild wait | Poll `blog.cacheID` until it stops changing — it is bumped at the end of every sync, so it is the natural settled marker. **Order matters:** `.verification/` is not ignored by the watcher, so writing screenshots itself bumps `cacheID`. Settle first, *then* screenshot, or the two chase each other |
| 4 | Screenshot helper | Standalone host-side wrapper, copying the viewports (`1260×778` / `400×650`), `networkidle0` wait and retry/throttle behaviour from `app/helper/screenshot` rather than importing it — its `args.js` is tuned for Alpine |
| 5 | Iteration cap | Agent inner loop capped around 5 rounds, plus `--max-budget-usd`. The operator is the real stop condition |
| 6 | Tool allowlist | `Read, Write, Edit, Glob, Grep, WebFetch, Bash(node:*)` — no unrestricted `Bash`, since the agent is processing untrusted third-party HTML |
| 7 | Screenshot for the operator | `.verification/` already holds them; no separate export step |

### 7.3 Resolved externally

- **Chokidar ignore patterns in `app/clients/local/setup.js` — DONE**, commit
  `4d276a06a` "Ignore file events in local client". Adds `ignored: shouldIgnoreFile`
  to the `chokidar.watch` call. Re-measured against the running stack:

  | Operation | Before | After |
  |---|---|---|
  | `git init` + `add` + commit (1 file) | 42 syncs | **1** (for the content file) |
  | New file + commit | — | **1** |
  | Empty commit, no content change | — | **0** |

  Reusing `shouldIgnoreFile` rather than a `.git`-specific regex is the better
  hook: it splits on both separators and tests every path component against the
  same ignore sets the write path already uses, so it works on relative and
  absolute paths and sweeps up `.DS_Store`, `._*`, `~$*` and `.swp` at the same
  time. `git init --separate-git-dir` is no longer needed as a workaround.

### 7.4 Still genuinely open

Nothing blocking remains. Both items below were resolved by taking a default
rather than a deliberate choice — flag them if you disagree:

1. **How the agent signals a scoped re-crawl** (§6.7) — taken as: a request file
   the wrapper reads after the turn, the same mechanism as `BLOCKED.txt`. Keeps
   the tool allowlist tight and gives one uniform "the agent wants something"
   channel, rather than letting it shell out to `crawl.js` directly.
2. **What "converged" means for the agent's inner loop** (§6.4) — taken as: the
   agent declares itself done and the operator decides for real. Image diffing is
   a weak proxy for design fidelity, and a human is in the loop anyway.
### 7.5 Not a question — just must not be forgotten

**Non-goals to state explicitly in the agent's brief.** Blot has no Sass, no view
subdirectories, no server-side JS in templates, and no per-request logic beyond
Mustache sections and the whitelisted locals. Source sites relying on client-side
frameworks need that behaviour reimplemented as plain CSS/JS. This has to be
written down where the agent will see it (§4.10, §6.8).

---

## 8. File index

**Provisioning**
```
app/configure-local-blogs.js              dev user/blog bootstrap
app/models/blog/create.js  defaults.js    Blog.create + defaults
app/models/blog/validate/handle.js        handle rules + banned.txt
app/clients/local/{README,setup.js,init.js,write.js}
app/templates/folders/{index.js,setupUser.js,setupBlogs.js,config.js}
scripts/blog/create.js                    CLI blog creation
scripts/test/setup-restore-git-test.js    create template + enable local editing
```

**Content**
```
app/build/README                          the whole build pipeline
app/build/metadata.js                     metadata block parsing
app/build/prepare/{title,tags,teaser,summary,isHidden,permalink}.js
app/build/prepare/dateStamp/{index,fromPath,fromMetadata}.js
app/sync/{index.js,update/set.js}         sync + Public/Templates/_ exclusions
app/dashboard/site/import/helper/*        the importer toolkit
app/dashboard/site/import/sources/wordpress/index.js
                                          wordpress(src,out,status,opts,cb)
                                          — emptyDirSync's the output dir
app/dashboard/site/import/sources/blogger/index.js
                                          blogger(src,out,status,siteHost) async
app/dashboard/site/import/sources/blogger/router.js#isBloggerExport
                                          .atom / application/atom+xml detection
app/dashboard/site/import/sources/squarespace/router.js
                                          delegates wholesale to wordpress
app/dashboard/site/import/sources/arena/  network-sourced importer, for shape
app/clients/util/shouldIgnoreFile.js      .git ignored as content (§6.10)
app/clients/local/setup.js:68             chokidar with NO ignore patterns
scripts/test/setup-restore-git-test.js    existing git-in-a-blog-folder precedent
app/views/how/metadata.html               user-facing metadata reference
app/views/how/sub-folders/*.html          Pages / Drafts / Templates
app/views/how/ignore_file.html            underscore convention
app/views/how/formatting/layout-tags.html {<} {>} {<<} etc.
```

**Templates**
```
app/models/template/README                authoritative model reference
app/models/template/{writeToFolder,readFromFolder,buildFromFolder,package,
                     determineTemplateFolder,parseTemplate,getView,getPartials,
                     getViewByURL}.js
app/models/template/util/updateCdnManifest.js
app/models/template/metadataModel.js      note: no `enabled` field (§5.1)
app/models/template/removeEnabledFromAllTemplates.js
app/templates/index.js                    SITE template build (underscore stripping,
                                          font/highlighter hydration)
app/templates/source/blog/*               simplest complete template
app/templates/readme.txt                  design notes (partly out of date)
app/dashboard/site/template/index.js      local-editing route
app/dashboard/site/template/load/README    locals → dashboard controls
app/blog/README                           request lifecycle + render pipeline
app/blog/render/retrieve/index.js         the locals whitelist
app/blog/render/middleware.js:110         ?json=true / ?debug=true
app/blog/vhosts.js                        preview subdomains
app/helper/urlNormalizer.js               default view URL derivation
```

**Folder portability (§5)**
```
app/models/template/readFromFolder.js        reads "enabled" → installs template
app/models/template/package.js               generate() drops `enabled`
app/models/template/metadataModel.js         no `enabled` field
app/models/template/removeEnabledFromAllTemplates.js
                                             rewrites enabled:false on install
app/dashboard/site/template/index.js
  /:templateSlug/download-zip                same omission, confirms §5.1
clients/util/shouldIgnoreFile.js             exclusion list for manual cleanup
app/templates/folders/index.js               round-trip validation pattern (§5.3)
```

**Preflight / environment health**
```
app/server.js:116                            GET /health (Express catch-all)
app/site/index.js:49                         GET /health (site vhost)
config/openresty/setup.sh                    mkcert wildcard cert into data/ssl
/etc/resolver/blot                           nameserver 127.0.0.1 → *.blot wildcard
```

**Verification / screenshots**
```
app/helper/screenshot/index.js               screenshot(site, path, options)
app/helper/screenshot/args.js                Alpine-tuned chromium flags
app/helper/screenshot/retry.js
app/templates/screenshots.js                 the existing caller; timeout pattern
app/sync/update/set.js#isPublic              why /.verification/ is never a post
app/blog/assets.js                           why /.verification/*.png is served
node_modules/puppeteer (host, 24.1.1)        + ~/.cache/puppeteer/chrome
```

**Operator UI / interaction / idempotency**
```
scripts/development/open-folder-server.js    the local-http-server pattern, port 3020
scripts/util/getConfirmation.js              readline prompt pattern
app/server.js:53-77                          X-Frame-Options + frame-ancestors
app/blog/vhosts.js:100-101                   preview subdomains strip both headers
app/blog/draft.js:86-87                      /_draft/* strips both headers
app/views/dashboard/template/js/
  template-editor-preview-iframe.js          working preview-iframe UI to copy
app/templates/folders/index.js               hashFile diff → {added,modified,removed}
app/templates/folders/setupBlogs.js          reuse-blog-by-handle idempotency
app/dashboard/site/import/helper/process.js  preserve_output_directory flag
app/dashboard/site/import/helper/write.js    path reservation → duplicates on re-crawl
```

**Docs to hand to the agent**
```
app/views/developers/reference.yml            complete locals/entry reference
app/views/developers/get-started.html
app/views/developers/guides/mustache.html
app/views/developers/guides/how-blot-works.html
app/views/developers/guides/working-with-ai.html   ← the AGENTS.md template
app/views/developers/guides/dashboard-controls.html
app/views/developers/guides/convert-jekyll-template/index.html
app/views/developers/guides/{thumbnails,seo-social-meta-tags,teaser-more-tags,
                             custom-metadata,customize-callouts}.html
app/views/developers/examples/*.html
```

**Environment**
```
scripts/development/{start.sh,docker-compose.yml,folder.sh,open-folder-server.js}
Dockerfile                                NODE_PATH, pandoc, sharp/vips, chromium
config/index.js                           host, protocol, directories, cdn
package.json                              existing npm script conventions
```
