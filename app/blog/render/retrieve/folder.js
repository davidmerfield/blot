const fs = require("fs-extra");
const Path = require("path");
const localPath = require("helper/localPath");
const alphanum = require("helper/alphanum");
const { getEntry } = require("../../lib/models");
const asRetriever = require("../../lib/asRetriever");
const LRUCache = require("lru-cache").LRUCache;
const { cloneDeep } = require("../../lib/clone");

const CONCURRENCY = 5;

const folderCache = new LRUCache({
  max: 200,
  maxSize: 10 * 1024 * 1024,
  sizeCalculation: (value) => {
    const contents = value && value.contents;
    return Array.isArray(contents) ? Math.max(1, contents.length * 256) : 64;
  },
});

function createCacheKey(blog, path) {
  return JSON.stringify({
    blogID: String(blog && blog.id),
    cacheID: String(blog && blog.cacheID),
    path: String(path),
  });
}

async function mapLimit(items, limit, iterator) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await iterator(items[index], index);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function folder(req, res) {
  let path = "/";
  let parent;

  if (req.query.path) {
    path = req.query.path;
  }

  if (path !== "/") {
    parent = Path.dirname(path);
  }

  const bypassCache = !!req.preview;
  const key = createCacheKey(req.blog, path);

  if (!bypassCache && folderCache.has(key)) {
    return cloneDeep(folderCache.get(key), { preserveEntryInstances: true });
  }

  let contents;

  try {
    contents = await fs.readdir(localPath(req.blog.id, path));
  } catch (err) {
    // We should pass this error back to the template in future
    return [];
  }

  // Remove dotfiles and folders
  contents = contents.filter((item) => item[0] !== ".");
  // `contents` is an array of raw filenames at this point, not objects,
  // so there's no `name` property to sort by - sort the strings directly.
  contents = alphanum(contents);

  try {
    contents = await mapLimit(contents, CONCURRENCY, async (name) => {
      const fullPathToItem = Path.join(path, name);
      const [stat, entry] = await Promise.all([
        fs.stat(localPath(req.blog.id, fullPathToItem)),
        getEntry(req.blog.id, fullPathToItem),
      ]);

      return {
        name: name,
        path: fullPathToItem,
        pathURI: encodeURIComponent(fullPathToItem),
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        entry: entry,
        updated: stat.mtime,
      };
    });
  } catch (err) {
    return [];
  }

  const result = {
    contents,
    parent,
    parentURI: encodeURIComponent(parent),
  };

  if (!bypassCache && contents.length > 0) {
    folderCache.set(key, cloneDeep(result, { preserveEntryInstances: true }));
  }

  return result;
}

const retriever = asRetriever(folder);
retriever._clear = function () {
  folderCache.clear();
};
retriever._createCacheKey = createCacheKey;

module.exports = retriever;
