# Importer tests

Run only the importer suite from the repository root:

```sh
npm test -- app/dashboard/site/import
```

Shared helpers live in `tests/utilities.js`. Every test creates an isolated tree
containing `input`, `output`, and `import` directories and removes it after use.
Use `fixture(name)` to load data from `tests/fixtures`; fixture files should be
small, deterministic, scrubbed of personal data, and named for their source
(`blogger-*`, `wordpress-*`, or `arena-*`). Keep binary assets to the minimum
needed to exercise a format.

All HTTP traffic must be declared with the helper's `nock` instance. Tests
disable unmocked network access and verify that every mock was consumed. Use
`inspectFiles()` and `inspectZip()` for stable, POSIX-path, sorted snapshots of
generated output rather than depending on filesystem traversal order or ZIP
timestamps.
