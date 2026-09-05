# Template design patterns

Each file in this directory (except `index.js` and `tests.js`) is one pattern.

The developer documentation, `/developers/patterns.md`, `/developers/patterns.json`, and the **Copy for agent** button are all generated from these modules. Do not duplicate the HTML/CSS/JS in the view files.

## Add a pattern

1. Create `app/documentation/patterns/your-slug.js` exporting the fields in `REQUIRED_FIELDS` (`index.js`).
2. `require()` it from the `PATTERNS` array in `index.js`.
3. Keep HTML/CSS self-contained and Mustache-only. Prefer no JavaScript. If the pattern needs a script, export `js` / `jsFile` and a `demoJS` body that uses the `root` node (the live demo wrapper).
4. Point `sourceTemplates` at the bundled templates this was extracted from.
5. Write `demoHTML` with static sample content (no Mustache, no `script` tags). Demo CSS is auto-scoped to `.pattern-demo--your-slug`. Demo JS is wrapped so it only runs inside that wrapper.
6. Run `app/documentation/patterns/tests.js`.
