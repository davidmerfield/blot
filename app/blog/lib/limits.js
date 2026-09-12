// Hard cap on how many entries the archives and allEntries template tags
// fetch. Without it, large blogs (nashp.com had ~800 entries at the time of
// issue #1806) load and synchronously process every entry on every request
// to /archives, which under aggressive bot crawling was serialized/slow
// enough to block the shared Node event loop and OOM the process.
//
// This is a breaking change for templates that rely on allEntries/archives
// listing every single post on very large blogs - it is an experiment to
// see whether clamping resolves the pathological behaviour before investing
// in a precomputed archive index.
module.exports.MAX_ENTRIES = 500;
