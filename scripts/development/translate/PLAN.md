# `npm run translate <url>` — Implementation plan

Companion to [RESEARCH.md](RESEARCH.md). Section references (§) point there.

**Goal.** A development script that scaffolds a Blot site, waits for the operator
to supply content, then drives the Claude Code CLI to build a template reproducing
the design at `<url>` — iterating against screenshots with operator feedback.

**Not in scope.** Content acquisition (see `scripts/development/dynamic-importer`),
zipping the result (the operator does it by hand), anything in the dashboard.

**Sequencing principle.** Every milestone leaves something runnable and verifiable
by hand. The agent does not appear until milestone E, by which point provisioning,
the content gate, screenshots and the comparison UI can all be exercised without
spending a token.

**Test material.** The repo already ships demo folders at `app/templates/folders/`
(`david`, `bjorn`, `clara`, `lecture`, `thoughtforms`, …). Copy one into a
scaffolded site and the whole pipeline is exercisable before any crawler exists.

**Prerequisite for every task:** `npm start` running in another window.

**Status:** Milestones A, B, C and D complete. `npm run translate <url>` provisions a
site, scaffolds a locally-edited template cloned from `SITE:blog`, initialises a
git repo, then waits for content and verifies it built before committing it.
Next: milestone E (first agent turn).

Two findings worth carrying forward:

- **A post's date does not come from the file's mtime.** With no `Date:` metadata
  and no date in the path, `build/prepare/dateStamp` returns undefined and
  `models/entry/set.js:70` falls back to `entry.created` — when the file was
  *added to Blot*. `content-check.js` detects the symptom (every post sharing
  today's date) and explains it.
- **`.verification/` is not watcher-ignored**, but `content-check` reads the
  database rather than the filesystem, so this does not affect the gate. The
  capture step settles *before* shooting for the same reason.
- **Source-page pairing is best-effort.** A local post's source URL is guessed by
  reusing its path, which only holds when permalinks were preserved. `capture.js`
  drops any source shot returning 4xx rather than pairing a 404 against a real
  page, and says so.

---

## Milestone A — Provision and scaffold  ✅ COMPLETE

*Done when: `npm run translate <url>` leaves you a working site with an empty,
locally-edited template installed.*

### A1. Script skeleton and npm entry point  ✅
- Create `translate.sh` with `set -euo pipefail` (matches every other script in
  `scripts/development/`).
- Add `"translate": "./scripts/development/translate/translate.sh"` to
  `package.json`.
- Argument validation: require `<url>`, print usage when absent — follow
  `scripts/development/folder.sh`, which lists valid options on bad input.
- **Done when:** `npm run translate` prints usage; `npm run translate https://x.com`
  gets past argument parsing.

### A2. Preflight (§1.5)  ✅
- `docker ps` must list `blot-node-app-1`.
- Resolve the host authoritatively:
  `docker exec blot-node-app-1 node -e 'console.log(require("config").host)'`
  (do **not** read `BLOT_HOST` from the host env — `start.sh` defaults it to
  `local.blot` but `config/index.js` defaults to `localhost`).
- `GET https://<host>/health` must return 200. Use `--insecure`: an untrusted
  mkcert certificate is not the same failure as a server being down.
- Two or three retries with short backoff — the container can be up while nodemon
  is mid-restart.
- Each failure gets its own remedy message, both pointing at "run `npm start` in
  another window".
- **Done when:** it passes with the stack up, and fails fast with a clear message
  when you stop the container.

### A3. Handle derivation (§7.2 default 2)  ✅
- Pure function, its own module: URL → handle. Strip scheme, `www.`, TLD;
  lowercase; strip to `[a-z0-9]`; 2–70 chars; numeric suffix on collision.
- Must be **deterministic** — re-run detection (G2) depends on the same URL
  producing the same handle.
- Reject against `app/models/blog/validate/banned.txt` before use.
- **Done when:** unit-tested against a table of URLs including punycode, deep
  paths, ports and `www.`.

### A4. `index.js` — provision the blog (in container)  ✅
- Runs via `docker exec blot-node-app-1 node scripts/development/translate …`
  (module resolution needs the container's `NODE_PATH=/usr/src/app/app`).
- Get-or-create user `example@example.com` (hardcoded in
  `app/configure-local-blogs.js:6`, not configurable — §2.1). Mirror its
  create logic so a fresh Redis works.
- Get-or-create blog by handle — `app/templates/folders/setupBlogs.js` is the
  precedent, including "throw if owned by another user".
- `Blog.set(blogID, { client: "local", forceSSL: false })`.
- Start the watcher in the **master** process by publishing to Redis:
  `client.publish("clients:local:new-folder", JSON.stringify({ blogID }))`.
  **Must be JSON** — `app/clients/local/init.js:46` does `JSON.parse`, and a bare
  ID throws in the server log while the watcher silently never starts.
- Print `blogID`, handle, site URL and dashboard URL as parseable lines for the
  shell wrapper to consume (`preview-newsletter.sh` greps script output the same
  way).
- **Done when:** running it twice produces one blog, and
  `https://<handle>.local.blot` responds.

### A5. Template scaffold  ✅
- `Template.create(blogID, name, { cloneFrom: "SITE:blog" })` — catch
  `err.code === "EEXISTS"` and reuse (§6.2).
- `Template.setMetadata(id, { localEditing: true })` then
  `Template.writeToFolder(blogID, id)` — `scripts/test/setup-restore-git-test.js`
  is a working example of this exact sequence.
- `Blog.set(blogID, { template: id })` so it renders locally.
- **Done when:** `data/blogs/<blogID>/Templates/<slug>/` contains the cloned views
  and the site renders with them.

### A6. `git init` the folder (§6.10)  ✅
- Plain `git init` at provisioning, before anything else is written, so the first
  content commit has an empty baseline.
- Write `.gitignore` containing `.verification/`.
- Commit the scaffold.
- No `--separate-git-dir` needed: commit `4d276a06a` added
  `ignored: shouldIgnoreFile` to the local client's watcher (measured 42 → 1 sync).
- **Done when:** `git log` shows the scaffold commit and a commit with no content
  change triggers zero syncs in the container log.

---

## Milestone B — Content gate  ✅ COMPLETE

*Done when: the script waits for content and refuses to continue until entries
actually exist.*

### B1. `content-check.js` (§3.2)  ✅
- In container. `Entries.getAllIDs(blogID)` → **filter on `deleted`**; the ID index
  retains soft-deleted paths (verified).
- Report a breakdown: posts, pages, tags, date range.
- Exit non-zero when nothing usable is present.
- **Done when:** it reports 0 on an empty folder, and correct counts after copying
  `app/templates/folders/david` in.

### B2. The wait-and-verify prompt (§3.1)  ✅
- Print the absolute host path (`data/blogs/<blogID>/`) and the three routes for
  getting content in: dashboard importer, `dynamic-importer`, or by hand.
- Optionally open the folder — `open -R`, or reuse the host-side opener already
  running on port 3020 (`scripts/development/open-folder-server.js`).
- On Enter: run B1, and if it fails, say what was missing and prompt again rather
  than aborting.
- Commit the content as supplied, before the agent touches anything (§6.10).
- **Done when:** pressing Enter with an empty folder re-prompts; pressing Enter
  after copying a demo folder proceeds and commits.

### B3. Settle helper (§7.2 default 3)  ✅

### B4. `rescan.js` — not in the original plan, but required  ✅
The watcher cannot be relied on for content the operator drops in.
`app/clients/local/setup.js` starts chokidar with `ignoreInitial: true`, and only
after `sync/fix` completes — so anything already in the folder when the watcher
starts is invisible to it, permanently. `sync/fix` does not rescue this: it only
removes ghosts of files that have gone, it never discovers new ones.

`rescan.js` walks the folder and calls `folder.update()` per path, the same
mechanism `app/templates/folders/index.js` uses to load the demo folders. Two
details it needs:

- **Retry on lock contention.** The watcher takes the same folder lock for every
  event it processes, and `sync` gives up after ~11s. Dropping in a directory can
  keep it busy far longer, so `rescan` retries (10 × 4s) rather than failing.
- **Settle first.** The gate settles before rescanning so the watcher's queue has
  drained and the lock is free.

**Done when:** content copied in with *zero* delay after provisioning is still
found on the first pass. Verified.
- Poll `blog.cacheID` until it stops changing (bumped at the end of every sync).
- Needed because sync latency is variable — creates were instant in testing, a
  delete took ~30s.
- **Order matters:** `.verification/` is *not* watcher-ignored, so writing
  screenshots bumps `cacheID` too. Settle first, then screenshot.
- **Done when:** it returns promptly on a quiet folder and waits out a bulk copy.

---

## Milestone C — Screenshots  ✅ COMPLETE

*Done when: you can produce `.verification/input-*.png` and `output-*.png` pairs by
hand.*

### C1. `screenshot.js` — host-side wrapper (§7.2 default 4)  ✅
- Runs **on the host**: the container resolves `*.local.blot` to `127.0.0.1`, which
  is itself, so it cannot reach the site (verified — connection refused).
- Standalone rather than importing `app/helper/screenshot` (its `args.js` is tuned
  for Alpine), but copy its behaviour: viewports `1260×778` desktop / `400×650`
  mobile, `deviceScaleFactor: 2`, `networkidle0`, bounded page timeout, one browser
  reused across shots, retry on failure.
- Host puppeteer is already installed (24.1.1, browser in `~/.cache/puppeteer/chrome`).
- **Done when:** it captures any URL to a path at both viewports.

### C2. Capture the pair  ✅
- Source URL and the local site, at matching viewports, into `.verification/`.
- Naming: `input-<page>.png` / `output-<page>.png` so pairs are matchable by suffix.
- Page set: homepage plus one representative entry. Resolve the entry URL from the
  folder rather than guessing.
- Prefer the preview subdomain for the local side —
  `https://preview-of-my-<slug>-on-<handle>.<host>/` — it skips CDN rewriting and
  surfaces template errors on a dedicated page.
- Tolerate source-site failures (timeouts, bot blocking) without killing the run.
- **Done when:** a full pair set lands in `.verification/` for a demo folder.

---

## Milestone D — Comparison UI  ✅ COMPLETE

*Done when: `open http://localhost:3021` shows the pairs and accepts feedback.*

### D1. `compare-server.js` (§6.6.2)  ✅
- Plain `http.createServer` on **3021** (verified free; 3020 is the folder opener).
- Model it on `scripts/development/open-folder-server.js`.
- Serve the `.verification/` PNGs and a single self-contained HTML page.
- **Done when:** the page loads and shows the images.

### D2. The comparison view  ✅
- Side-by-side pairs, plus an **opacity-blend slider** — far better than
  side-by-side for spotting layout drift.
- Links that open the source and the local site in real tabs (always works, no
  header constraints).
- Optionally a live iframe of the Blot side via the preview subdomain: those strip
  `X-Frame-Options` and CSP (`app/blog/vhosts.js:100-101`). The **source** site
  usually cannot be framed, so never depend on it.
- **Done when:** blending between input and output works for the homepage pair.

### D3. Feedback intake  ✅
- A textarea that POSTs back to the server, which holds the pending feedback for
  the shell loop to read.
- Makes the UI and the feedback loop one mechanism instead of two.
- **Done when:** submitting text writes it somewhere the shell can pick up.

---

## Milestone E — First agent turn

*Done when: one `claude -p` invocation produces a template that renders.*

### E1. The two READMEs (§6.5)
- `README.folder.md` and `README.template.md` as templates, interpolated at
  scaffold time.
- Both land as a file named `README`, **no extension**, Markdown inside. At the
  folder root it is ignored entirely (no converter matches an extensionless file);
  in the template it becomes a `/readme` view, which is accepted and matches seven
  shipped templates.
- Contents per §6.5 — the folder one is the handover note, the template one is the
  brief for whoever (or whatever) edits the design next.
- **Done when:** both are written at scaffold time with the right substitutions.

### E2. `prompt.md` — the agent brief (§6.8)
- Extend `/developers/guides/working-with-ai` with: retrievable locals (§4.6),
  entry properties (§3.4), the folder conventions that shape a template (§3.3),
  the `package.json` schema (§4.3), **the default-route gotcha** (§4.4 — a view's
  default URL keeps its file extension), dashboard-control naming (§4.9), and the
  portability rules (§5.2).
- State the hard constraints loudly (§4.10): no view subdirectories, no SCSS, 2 MB
  view cap, no basename collisions, `{{{ }}}` for URLs and HTML.
- State the non-goals (§7.5): no Sass, no server-side JS, no per-request logic.
- **Anti-anchoring instructions** (§6.2) — the `SITE:blog` clone is structure and
  plumbing, not a design: rewrite `style.css` from scratch, restructure the
  inherited markup freely.
- Say that content edits are permitted and when they are the right fix (§3.3).
- **Done when:** the brief is complete enough that a human could follow it.

### E3. Invoke the CLI (§6.3)
- On the **host** (no `claude` binary or credentials in the container).
- `claude -p --output-format json --permission-mode acceptEdits`, cwd
  `data/blogs/<blogID>/`, `--add-dir` for the brief so it stays out of the folder.
- Tool allowlist `Read, Write, Edit, Glob, Grep, WebFetch, Bash(node:*)` — **not**
  unrestricted `Bash`; the agent is processing untrusted third-party HTML.
- `--session-id <uuid>` pinned on the first run.
- `--max-budget-usd` plus a process timeout.
- **Done when:** one invocation edits the template and the site still renders.

### E4. Abort handling (§6.3)
- Non-zero exit is fatal and propagates through `set -euo pipefail`.
- Check for `.verification/BLOCKED.txt` after the turn; if present, print its
  contents as the abort reason. Exit code alone cannot distinguish "finished" from
  "gave up".
- Commit after the turn.
- **Done when:** a deliberately-written `BLOCKED.txt` aborts the run with its
  message.

---

## Milestone F — The loop

*Done when: you can iterate to a result you are happy with, then stop.*

### F1. Terminal feedback prompt (§6.6.1)
- `readline` prompt: Enter accepts, text becomes feedback, `q` aborts.
- Extend the `scripts/util/getConfirmation.js` shape (promise + optional callback).
- Requires a TTY — do not run the script in a pipeline that detaches stdin.
- **Done when:** each of the three inputs does the right thing.

### F2. Resume with feedback
- `claude --resume <session-id>` with the feedback prepended, so it lands in a
  session that already knows what it built.
- Read pending feedback from either the terminal or the comparison server (D3).
- Commit each round with the feedback text as the message (§6.10) — the log
  becomes a record of the conversation.
- **Done when:** feedback visibly changes the next turn's output.

### F3. Wire the loop
- `agent turn → settle (B3) → screenshot (C2) → serve/refresh UI (D1) → prompt (F1)`
  → repeat or exit.
- Cap the agent's inner rounds (~5) and rely on the operator as the real stop
  condition.
- **Done when:** two or three rounds run end to end without manual intervention
  between them.

---

## Milestone G — Finish and re-run

*Done when: the folder is handover-ready and re-running continues rather than
restarts.*

### G1. `finalize.js` (§5.1, §5.2)
- **Re-assert `"enabled": true`** in `Templates/<slug>/package.json`. Nothing in
  Blot will do this: `enabled` is absent from `metadataModel.js`, `package.save`
  drops it, and `package.generate` therefore never emits it. Two paths also strip
  it back out — `writeToFolder` regenerating the file, and
  `removeEnabledFromAllTemplates` on a dashboard install — so assert it last.
- `grep` the folder for host-specific strings: `local.blot`, `cdn.local.blot`, the
  blog ID. Report, do not auto-edit.
- Print the folder path, site URL, preview URL, and a reminder that `.git/` and
  `.verification/` are dot-directories excluded by Finder's select-all zip.
- **Done when:** the flag survives a dashboard template install followed by
  finalize, and the grep catches a deliberately planted `https://cdn.local.blot`.

### G2. `state.js` and the re-run flow (§6.7)
- Run state at `data/tmp/translate/<handle>.json` via `helper/tempDir()` — outside
  the blog folder so it can never reach the operator's zip.
- Store: source URL, `blogID`, handle, template slug, `--session-id`, run count,
  timestamps.
- On a re-run: print a summary, **skip the content gate**, and prompt for guidance
  *before* doing any work — the operator already knows what they disliked.
- **Done when:** a second run on the same URL reuses the site and resumes the
  session.

### G3. Docs and polish
- Short `README` in `scripts/development/translate/` — what it does, prerequisites,
  the manual zip step, and the pointer to `dynamic-importer`.
- Make sure failure messages name the remedy, not just the symptom.
- **Done when:** someone else can run it from the README alone.

---

## Optional / later

- **Round-trip validation** (§5.3): provision a second empty blog, copy the folder
  in, let it sync, screenshot. If `"enabled": true` is doing its job the second
  site renders identically with zero configuration. The strongest end-to-end proof;
  not needed for a first version.
- **Mobile viewport in the comparison UI** — `screenshot.js` supports it from C1;
  it is only a UI question.
- **Run-numbered `.verification/` subdirectories** if screenshot history proves
  useful.

---

## Risks to watch

| Risk | Mitigation |
|---|---|
| Anchoring on the `SITE:blog` clone — output looks like Blot's default rather than the source | Explicit anti-anchoring instructions in E2; check for it during verification (§6.2) |
| Source site blocks headless browsers or times out | C2 tolerates source failures; fall back to an operator-supplied screenshot |
| Agent thrashes without converging | Inner-round cap, `--max-budget-usd`, operator stop condition (F3) |
| `"enabled": true` silently lost | Asserted last, every run (G1), and stated in the folder README so a human can restore it |
| Prompt injection via crawled/rendered HTML | Scoped tool allowlist, `acceptEdits` rather than `bypassPermissions` (E3) |
