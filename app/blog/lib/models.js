const Blog = require("models/blog");
const Entry = require("models/entry");
const Entries = require("models/entries");
const Template = require("models/template");
const Tags = require("models/tags");
const Redirects = require("models/redirects");
const User = require("models/user");
const client = require("models/client");
const blogKey = require("models/blog/key");
const LRUCache = require("lru-cache").LRUCache;
const { cloneDeep, prepareCacheValue } = require("./clone");

// All adapters look up the model method at call time so Jasmine spies
// (and other runtime replacements) still take effect.

const MISS_TTL_MS = 2000;

const blogByIdCache = new LRUCache({
  max: 5000,
  maxSize: 20 * 1024 * 1024,
  sizeCalculation: (value) => value.size,
});
const blogInflight = new Map();

const metadataCache = new LRUCache({
  max: 2000,
  maxSize: 20 * 1024 * 1024,
  sizeCalculation: (value) => value.size,
});
const metadataInflight = new Map();

const viewByUrlCache = new LRUCache({
  max: 10000,
  maxSize: 5 * 1024 * 1024,
  sizeCalculation: (value) => value.size,
});
const viewByUrlInflight = new Map();

const entryByUrlCache = new LRUCache({
  max: 10000,
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (value) => value.size,
});
const entryByUrlInflight = new Map();

const adjacentCache = new LRUCache({
  max: 5000,
  maxSize: 20 * 1024 * 1024,
  sizeCalculation: (value) => value.size,
});
const adjacentInflight = new Map();

function cloneBlog(value) {
  return cloneDeep(value);
}

function cloneMetadata(value) {
  return cloneDeep(value);
}

function cloneViewMatch(value) {
  return cloneDeep(value);
}

function cloneEntryValue(value) {
  return cloneDeep(value, { preserveEntryInstances: true });
}

function cloneAdjacent(value) {
  return cloneDeep(value, { preserveEntryInstances: true });
}

function identifierKey(identifier) {
  if (identifier && identifier.id) return "id:" + identifier.id;
  if (identifier && identifier.handle) return "handle:" + identifier.handle;
  if (identifier && identifier.domain) return "domain:" + identifier.domain;
  return JSON.stringify(identifier || {});
}

async function withInflight(map, key, loader) {
  if (map.has(key)) return map.get(key);
  const promise = loader();
  map.set(key, promise);
  try {
    return await promise;
  } finally {
    map.delete(key);
  }
}

function storeBlog(blog, fingerprint) {
  if (!blog || !blog.id) return;
  const prepared = prepareCacheValue(blog);
  blogByIdCache.set(
    blog.id,
    Object.freeze({
      payload: prepared.payload,
      size: prepared.size,
      fingerprint: fingerprint || "",
    })
  );
}

function fetchBlog(identifier) {
  return new Promise((resolve, reject) => {
    Blog.get(identifier, (err, blog) => {
      if (err) reject(err);
      else resolve(blog);
    });
  });
}

// cacheID only changes for template/plugins/menu. Domain, handle, title,
// isDisabled, forceSSL, and other identity fields do not bump it, so a
// cacheID HGET is not enough to decide the deserialized blog is still live.
function fingerprintHash(raw) {
  const keys = Object.keys(raw).sort();
  let out = "";
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    out += key + "=" + raw[key] + "\n";
  }
  return out;
}

async function resolveBlogID(identifier) {
  if (identifier && identifier.id) return identifier.id;
  if (identifier && identifier.handle) {
    return client.get(blogKey.handle(identifier.handle));
  }
  if (identifier && identifier.domain) {
    return client.get(blogKey.domain(identifier.domain));
  }
  return undefined;
}

async function loadBlogById(blogID) {
  let raw;
  try {
    raw = await client.hGetAll(blogKey.info(blogID));
  } catch (e) {
    raw = null;
  }

  const fingerprint =
    raw && Object.keys(raw).length ? fingerprintHash(raw) : "";
  const cached = blogByIdCache.get(blogID);
  if (cached && fingerprint && cached.fingerprint === fingerprint) {
    return cached.payload;
  }

  const blog = await fetchBlog({ id: blogID });
  if (blog) {
    storeBlog(blog, fingerprint);
    const stored = blogByIdCache.get(blog.id);
    return stored ? stored.payload : blog;
  }

  blogByIdCache.delete(blogID);
  return blog;
}

function getBlog(identifier) {
  const key = identifierKey(identifier);
  return withInflight(blogInflight, key, async () => {
    const blogID = await resolveBlogID(identifier);
    if (!blogID) return undefined;
    return loadBlogById(blogID);
  }).then((blog) => (blog ? cloneBlog(blog) : blog));
}

function fetchMetadata(templateID) {
  return new Promise((resolve, reject) => {
    Template.getMetadata(templateID, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });
}

async function getMetadata(templateID, cacheID) {
  if (cacheID === undefined || cacheID === null || cacheID === "") {
    return fetchMetadata(templateID);
  }

  const key = JSON.stringify({
    templateID: String(templateID),
    cacheID: String(cacheID),
  });

  const metadata = await withInflight(metadataInflight, key, async () => {
    if (metadataCache.has(key)) {
      return metadataCache.get(key).payload;
    }
    const fetched = await fetchMetadata(templateID);
    if (fetched) {
      metadataCache.set(key, prepareCacheValue(fetched));
      return metadataCache.get(key).payload;
    }
    return fetched;
  });

  return metadata ? cloneMetadata(metadata) : metadata;
}

function fetchViewByURL(template, url) {
  return new Promise((resolve, reject) => {
    Template.getViewByURL(template, url, (err, viewName, params) => {
      if (err) return reject(err);
      resolve({ viewName, params });
    });
  });
}

async function getViewByURL(template, url, cacheID) {
  if (cacheID === undefined || cacheID === null || cacheID === "") {
    return fetchViewByURL(template, url);
  }

  const key = JSON.stringify({
    templateID: String(template),
    cacheID: String(cacheID),
    url: String(url),
  });

  const match = await withInflight(viewByUrlInflight, key, async () => {
    if (viewByUrlCache.has(key)) {
      return viewByUrlCache.get(key).payload;
    }
    const fetched = await fetchViewByURL(template, url);
    const prepared = prepareCacheValue(fetched);
    if (fetched && fetched.viewName) {
      viewByUrlCache.set(key, prepared);
    } else {
      viewByUrlCache.set(key, prepared, { ttl: MISS_TTL_MS });
    }
    return prepared.payload;
  });

  return cloneViewMatch(match);
}

function fetchEntryByUrl(blogID, entryUrl) {
  return new Promise((resolve) => {
    Entry.getByUrl(blogID, entryUrl, (entry) => resolve(entry));
  });
}

async function getEntryByUrl(blogID, entryUrl, cacheID) {
  if (cacheID === undefined || cacheID === null || cacheID === "") {
    return fetchEntryByUrl(blogID, entryUrl);
  }

  const key = JSON.stringify({
    blogID: String(blogID),
    cacheID: String(cacheID),
    url: String(entryUrl),
  });

  const cached = await withInflight(entryByUrlInflight, key, async () => {
    if (entryByUrlCache.has(key)) {
      return entryByUrlCache.get(key).payload;
    }

    const entry = await fetchEntryByUrl(blogID, entryUrl);
    if (entry) {
      entryByUrlCache.set(
        key,
        prepareCacheValue(entry, { preserveEntryInstances: true })
      );
      return entryByUrlCache.get(key).payload;
    }

    // Negative lookups (the 404 path) are the expensive repeat case, but a
    // swallowed Redis error looks identical to a genuine miss. Keep those
    // cached only briefly so a blip cannot hide an entry until cacheID changes.
    entryByUrlCache.set(key, prepareCacheValue({ miss: true }), {
      ttl: MISS_TTL_MS,
    });
    return entryByUrlCache.get(key).payload;
  });

  if (!cached || cached.miss) return undefined;
  return cloneEntryValue(cached);
}

function fetchAdjacent(blogID, entryID) {
  return new Promise((resolve) => {
    Entries.adjacentTo(blogID, entryID, (next, previous, index) => {
      resolve({ next, previous, index });
    });
  });
}

async function adjacentTo(blogID, entryID, cacheID) {
  if (cacheID === undefined || cacheID === null || cacheID === "") {
    return fetchAdjacent(blogID, entryID);
  }

  const key = JSON.stringify({
    blogID: String(blogID),
    cacheID: String(cacheID),
    entryID: String(entryID),
  });

  const adjacent = await withInflight(adjacentInflight, key, async () => {
    if (adjacentCache.has(key)) {
      return adjacentCache.get(key).payload;
    }
    const fetched = await fetchAdjacent(blogID, entryID);
    adjacentCache.set(
      key,
      prepareCacheValue(fetched, { preserveEntryInstances: true })
    );
    return adjacentCache.get(key).payload;
  });

  return cloneAdjacent(adjacent);
}

function getFullView(blogID, templateID, viewName) {
  return new Promise((resolve, reject) => {
    Template.getFullView(blogID, templateID, viewName, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

function searchEntries(blogID, query, options) {
  return new Promise((resolve, reject) => {
    Entry.search(blogID, query, options, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

function listTags(blogID, options) {
  return new Promise((resolve, reject) => {
    Tags.list(blogID, options, (err, tags) => {
      if (err) reject(err);
      else resolve(tags);
    });
  });
}

function popularTags(blogID, options) {
  return new Promise((resolve, reject) => {
    Tags.popular(blogID, options, (err, tags) => {
      if (err) reject(err);
      else resolve(tags);
    });
  });
}

function checkRedirect(blogID, url) {
  return new Promise((resolve, reject) => {
    Redirects.check(blogID, url, (err, redirect) => {
      if (err) reject(err);
      else resolve(redirect);
    });
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    User.getById(id, (err, user) => {
      if (err) reject(err);
      else resolve(user);
    });
  });
}

// getPage's callback is (err, entries, pagination) — promisify would drop pagination.
function getPage(blogID, options) {
  return new Promise((resolve, reject) => {
    Entries.getPage(blogID, options, (err, entries, pagination) => {
      if (err) return reject(err);
      resolve({ entries, pagination });
    });
  });
}

// Entry.get and several Entries helpers are NOT err-first —
// they omit the error argument. Mirror the adapter used in models/entry/search.js.
function getEntry(blogID, entryIDs) {
  return new Promise((resolve) => {
    Entry.get(blogID, entryIDs, (entries) => resolve(entries));
  });
}

function randomEntry(blogID) {
  return new Promise((resolve) => {
    Entries.random(blogID, (entry) => resolve(entry));
  });
}

// getAll / getRecent callback with (entries) only — never an error argument.
function getAll(blogID) {
  return new Promise((resolve) => {
    Entries.getAll(blogID, (entries) => resolve(entries));
  });
}

function getRecent(blogID) {
  return new Promise((resolve) => {
    Entries.getRecent(blogID, (entries) => resolve(entries));
  });
}

function getTotal(blogID) {
  return new Promise((resolve, reject) => {
    Entries.getTotal(blogID, (err, total) => {
      if (err) reject(err);
      else resolve(total);
    });
  });
}

function clearCaches() {
  blogByIdCache.clear();
  blogInflight.clear();
  metadataCache.clear();
  metadataInflight.clear();
  viewByUrlCache.clear();
  viewByUrlInflight.clear();
  entryByUrlCache.clear();
  entryByUrlInflight.clear();
  adjacentCache.clear();
  adjacentInflight.clear();
}

module.exports = {
  getBlog,
  getMetadata,
  getFullView,
  getPage,
  searchEntries,
  listTags,
  popularTags,
  checkRedirect,
  getUserById,
  getViewByURL,
  getEntry,
  getEntryByUrl,
  adjacentTo,
  randomEntry,
  getAll,
  getRecent,
  getTotal,
};

module.exports._clear = clearCaches;
module.exports._MISS_TTL_MS = MISS_TTL_MS;
