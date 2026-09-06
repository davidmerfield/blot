const fs = require("fs-extra");
const path = require("path");
const alphanum = require("helper/alphanum");
const localPath = require("helper/localPath");
const Stat = require("./stat");
const client = require("models/client");
const pathNormalize = require("helper/pathNormalizer");
const Build = require("build");

const findMultiFolder =
  (Build && Build.findMultiFolder) ||
  function () {
    return null;
  };

// Pull the source-file paths out of a folder post's generated HTML. Returns
// an empty list for anything that is not a folder post so a stray data-file
// attribute in an ordinary post cannot be mistaken for aggregation.
function folderPostSourcePaths(html) {
  if (typeof html !== "string" || html.indexOf('class="multi-file-post"') === -1)
    return [];

  const paths = [];
  const pattern = /<section class="multi-file-entry"[^>]*\sdata-file="([^"]*)"/g;
  let match;

  while ((match = pattern.exec(html))) {
    paths.push(
      String(match[1])
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
    );
  }

  return paths;
}

async function getContents(blog, dir) {
  const local = localPath(blog.id, dir);
  const contents = await fs.readdir(local);

  const filtered = contents.filter((item) => {
    return !item.startsWith(".") && !item.endsWith(".preview.html");
  });

  const [entries, stats] = await Promise.all([
    new Promise((resolve) => {
      // Remove 'reject' parameter since it is not being used
      const lookups = filtered.map((item) => {
        const itemPath = pathNormalize(path.join(dir, item));
        const multiInfo = findMultiFolder(itemPath);
        const viaAggregate = !!(
          multiInfo && pathNormalize(multiInfo.entryPath) !== itemPath
        );
        const lookupPath = viaAggregate ? multiInfo.entryPath : itemPath;
        return {
          itemPath,
          viaAggregate,
          folderPath: multiInfo ? pathNormalize(multiInfo.folderPath) : null,
          key: `blog:${blog.id}:entry:${pathNormalize(lookupPath)}`,
        };
      });
      Promise.all(
        lookups.map((lookup) => {
          return client.get(lookup.key);
        })
      )
        .then((res) => {
          if (!res || !res.length) return resolve([]);
          resolve(
            filtered.filter((_, index) => {
              const raw = res[index];
              if (!raw) return false;

              let entry;
              try {
                entry = typeof raw === "string" ? JSON.parse(raw) : raw;
              } catch (err) {
                return false;
              }

              if (!entry || entry.deleted === true) return false;

              const lookup = lookups[index];

              // A file inside a "+" folder resolves to the shared aggregate
              // entry. Only badge it as published if it is actually the "+"
              // folder itself or one of the folder post's source files -
              // not an unsupported sibling like archive.zip.
              if (lookup.viaAggregate) {
                if (lookup.itemPath === lookup.folderPath) return true;
                return (
                  folderPostSourcePaths(entry.html).indexOf(lookup.itemPath) !==
                  -1
                );
              }

              return true;
            })
          );
        })
        .catch(() => {
          resolve([]);
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
      return stat;
    }),
    { property: "name" }
  );

  return result;
}

module.exports = getContents;
