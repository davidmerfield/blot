const fs = require("fs-extra");
const path = require("path");
const alphanum = require("helper/alphanum");
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

async function getContents(blog, dir, options = {}) {
  const pageSize = resolvePageSize(options.pageSize);
  const requestedPage = parseInt(options.page, 10);

  const local = localPath(blog.id, dir);
  const contents = await fs.readdir(local);

  const filtered = contents.filter((item) => {
    return !item.startsWith(".") && !item.endsWith(".preview.html");
  });

  // Sort names before paginating so the page boundaries are stable and match
  // the dashboard's default (name, ascending) sort order.
  const orderedNames = alphanum(filtered);

  const total = orderedNames.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    totalPages
  );
  const startIndex = (page - 1) * pageSize;
  const pageNames = orderedNames.slice(startIndex, startIndex + pageSize);

  const [entries, ignoredFiles, stats] = await Promise.all([
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
    Promise.all(
      pageNames.map(async (item) => {
        const fullPath = path.join(local, item);

        let stat;
        try {
          stat = await Stat(fullPath, blog.timeZone);
        } catch (err) {
          // The file may have been removed between readdir and stat (common
          // while a large folder is still syncing). Skip it rather than
          // failing – and rejecting – the entire listing.
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
    ),
  ]);

  const result = alphanum(
    stats
      .filter((stat) => stat !== null)
      .map((stat) => {
        stat.entry = entries.includes(stat.name);
        stat.tooLarge = ignoredFiles[pathNormalize(stat.path)] === "TOO_LARGE";
        if (stat.tooLarge) {
          // A previously published source that grew too large leaves a
          // deleted entry tombstone behind; don't show it as a live post.
          stat.entry = false;
          stat.postSizeLimit = postSourceSize.limitForPath(stat.path).label;
        }
        return stat;
      }),
    { property: "name" }
  );

  const pagination = {
    page,
    pageSize,
    totalPages,
    total,
    // 1-indexed range of items shown, for "Showing 1–1000 of 12,384"
    rangeStart: total === 0 ? 0 : startIndex + 1,
    rangeEnd: startIndex + result.length,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    previousPage: page - 1,
    nextPage: page + 1,
    // Only meaningful to show controls when there's more than one page.
    multiplePages: totalPages > 1,
  };

  return { contents: result, pagination };
}

getContents.DEFAULT_PAGE_SIZE = DEFAULT_PAGE_SIZE;

module.exports = getContents;
