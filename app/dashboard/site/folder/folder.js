const fs = require("fs-extra");
const path = require("path");
const alphanum = require("helper/alphanum");
const localPath = require("helper/localPath");
const Stat = require("./stat");
const client = require("models/client");
const entryKeys = require("models/entry").key;
const pathNormalize = require("helper/pathNormalizer");
const IgnoredFiles = require("models/ignoredFiles");
const postSourceSize = require("build/converters/post-source-size");

async function getContents(blog, dir) {
  const local = localPath(blog.id, dir);
  const contents = await fs.readdir(local);

  const filtered = contents.filter((item) => {
    return !item.startsWith(".") && !item.endsWith(".preview.html");
  });

  const [entries, ignoredFiles, stats] = await Promise.all([
    new Promise((resolve) => {
      // Remove 'reject' parameter since it is not being used
      // An entry may be stored as a legacy JSON string key, a Redis hash, or
      // (during the migration) both. EXISTS with multiple keys returns the
      // count, so >= 1 means the entry is present in some form.
      Promise.all(
        filtered.map((item) => {
          const entryPath = path.join(dir, item);
          return client.exists([
            entryKeys.entry(blog.id, entryPath),
            entryKeys.entryHash(blog.id, entryPath),
          ]);
        })
      )
        .then((res) => {
          if (!res || !res.length) return resolve([]);
          resolve(
            filtered.filter((_, index) => {
              const exists = res[index];
              return Number(exists) >= 1 || exists === true;
            })
          );
        })
        .catch(() => {
          resolve([]);
        });
    }),
    new Promise((resolve, reject) => {
      const childPaths = filtered.map((item) => path.join(dir, item));
      IgnoredFiles.getStatuses(blog.id, childPaths, function (err, ignored) {
        if (err) return reject(err);
        resolve(ignored);
      });
    }),
    Promise.all(
      filtered.map(async (item) => {
        const fullPath = path.join(local, item);
        const stat = await Stat(fullPath, blog.timeZone);

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
    stats.map((stat, index) => {
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

  return result;
}

module.exports = getContents;
