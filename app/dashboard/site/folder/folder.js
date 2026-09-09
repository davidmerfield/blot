const fs = require("fs-extra");
const path = require("path");
const localPath = require("helper/localPath");
const Stat = require("./stat");
const client = require("models/client");
const pathNormalize = require("helper/pathNormalizer");
const IgnoredFiles = require("models/ignoredFiles");
const postSourceSize = require("build/converters/post-source-size");

// Folders synced from Dropbox, Google Drive, git etc. can contain tens of
// thousands of files. Statting every entry, checking Redis for a matching
// post and rendering one <tr> per file used to happen in a single pass which
// could exhaust file descriptors / Redis connections and crash the server
// (see TODO: "Fix bug with folder viewer which crashes server for large
// number of entries"). We now sort the (cheap) list of names up front and
// only do the expensive per-file work for a single page of results.
const DEFAULT_PAGE_SIZE = 1000;

function resolvePageSize(pageSize) {
  const parsed = parseInt(pageSize, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
  // Never allow a caller to request a larger page than the default – the
  // whole point is to bound the amount of work per request.
  return Math.min(parsed, DEFAULT_PAGE_SIZE);
}

// Order names with the same comparator the directory table in
// app/views/dashboard/folder/directory.html applies on load: the name column
// is compared as name.toLocaleLowerCase().trim(), ascending. Paginating with
// a different order (e.g. natural/alphanum sort) would put "p10.txt" on a
// different page than where the rendered page then sorts it, making the
// listing appear to jump backwards between pages.
function byDisplayName(a, b) {
  const x = String(a).toLocaleLowerCase().trim();
  const y = String(b).toLocaleLowerCase().trim();
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

async function getContents(blog, dir, options = {}) {
  const pageSize = resolvePageSize(options.pageSize);
  const requestedPage = parseInt(options.page, 10);

  const local = localPath(blog.id, dir);
  const contents = await fs.readdir(local);

  const orderedNames = contents
    .filter((item) => {
      return !item.startsWith(".") && !item.endsWith(".preview.html");
    })
    .sort(byDisplayName);

  const total = orderedNames.length;
  // Upper bound on the number of pages. The true count can be lower when
  // entries vanish mid-read (see the backfill loop below), so hasNext – not
  // this – decides whether the "Next" control is shown.
  const estimatedPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    estimatedPages
  );
  const startIndex = (page - 1) * pageSize;

  // Walk forward from startIndex collecting up to pageSize entries that still
  // exist on disk. Files routinely disappear between readdir and stat while a
  // large folder is still syncing; skipping them without pulling the next
  // name forward would leave the page short and the running count adrift.
  const pageStats = [];
  let cursor = startIndex;

  while (pageStats.length < pageSize && cursor < orderedNames.length) {
    const batch = orderedNames.slice(
      cursor,
      cursor + (pageSize - pageStats.length)
    );
    cursor += batch.length;

    const batchStats = await Promise.all(
      batch.map(async (item) => {
        const fullPath = path.join(local, item);

        let stat;
        try {
          stat = await Stat(fullPath, blog.timeZone);
        } catch (err) {
          // The file was removed between readdir and stat. Skip it rather
          // than failing – and rejecting – the entire listing.
          if (err && err.code === "ENOENT") return null;
          throw err;
        }

        stat.path = path.join(dir, item);
        // we don't want to turn '/' into '%2F' so we split on '/' and encode each part separately
        stat.url = stat.path.split('/').map(encodeURIComponent).join('/');
        stat.fullPath = fullPath;
        stat.name = item;

        return stat;
      })
    );

    for (const stat of batchStats) if (stat !== null) pageStats.push(stat);
  }

  const hasNext = cursor < orderedNames.length;
  const pageNames = pageStats.map((stat) => stat.name);

  const [entries, ignoredFiles] = await Promise.all([
    new Promise((resolve) => {
      const keys = pageNames.map(
        (item) => `blog:${blog.id}:entry:${pathNormalize(path.join(dir, item))}`
      );
      Promise.all(
        keys.map((key) => {
          return client.exists(key);
        })
      )
        .then((res) => {
          if (!res || !res.length) return resolve([]);
          resolve(
            pageNames.filter((_, index) => {
              const exists = res[index];
              return (
                exists === 1 ||
                exists === "1" ||
                exists === true
              );
            })
          );
        })
        .catch(() => {
          resolve([]);
        });
    }),
    new Promise((resolve, reject) => {
      const childPaths = pageNames.map((item) => path.join(dir, item));
      IgnoredFiles.getStatuses(blog.id, childPaths, function (err, ignored) {
        if (err) return reject(err);
        resolve(ignored);
      });
    }),
  ]);

  // pageStats is already in byDisplayName order (batches walked in order),
  // and the directory table re-sorts on load anyway, so no re-sort here.
  const result = pageStats.map((stat) => {
    stat.entry = entries.includes(stat.name);
    stat.tooLarge = ignoredFiles[pathNormalize(stat.path)] === "TOO_LARGE";
    if (stat.tooLarge) {
      // A previously published source that grew too large leaves a
      // deleted entry tombstone behind; don't show it as a live post.
      stat.entry = false;
      stat.postSizeLimit = postSourceSize.limitForPath(stat.path).label;
    }
    return stat;
  });

  const pagination = {
    page,
    pageSize,
    // On the last page report the real number; otherwise the upper bound.
    totalPages: hasNext ? Math.max(estimatedPages, page + 1) : page,
    total,
    // 1-indexed range of items shown, for "1–1000 of 12,384".
    rangeStart: result.length === 0 ? 0 : startIndex + 1,
    rangeEnd: result.length === 0 ? 0 : startIndex + result.length,
    hasPrevious: page > 1,
    hasNext,
    previousPage: page - 1,
    nextPage: page + 1,
    // Only show controls when the listing actually spans more than one page.
    multiplePages: page > 1 || hasNext,
  };

  return { contents: result, pagination };
}

getContents.DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;

module.exports = getContents;
