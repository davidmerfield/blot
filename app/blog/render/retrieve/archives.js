const getAllCached = require("./helpers/getAllCached");
const arrayify = require("helper/arrayify");
const projectEntryFields = require("./helpers/projectEntryFields");
const moment = require("moment");
require("moment-timezone");
const asRetriever = require("../../lib/asRetriever");
const LRUCache = require("lru-cache").LRUCache;
const { cloneDeep, deepFreeze } = require("../../lib/clone");

// Caches the year/month grouping itself (not just the raw entry list) so
// repeat renders skip the grouping work too. Keyed on timeZone in addition
// to blogID/cacheID since the year/month buckets are computed from
// entry.dateStamp converted into the blog's timezone.
const archivesCache = new LRUCache({
  max: 200,
  maxSize: 100 * 1024 * 1024,
  sizeCalculation: (value) => JSON.stringify(value).length,
});

function createCacheKey(blog) {
  return JSON.stringify({
    blogID: String(blog && blog.id),
    cacheID: String(blog && blog.cacheID),
    timeZone: String(blog && blog.timeZone),
  });
}

function cloneYears(value) {
  return cloneDeep(value, { preserveEntryInstances: true });
}

function buildYears(allEntries, timeZone) {
  const years = {};

  for (const x in allEntries) {
    const entry = allEntries[x];

    const date = moment.utc(entry.dateStamp).tz(timeZone);

    const year = date.format("YYYY");
    const month = date.format("MMMM");

    years[year] = years[year] || {
      year: year,
      total: 0,
      months: {},
    };

    years[year].months[month] = years[year].months[month] || {
      month: month,
      entries: [],
    };

    years[year].months[month].entries.push(entry);
    years[year].total++;
  }

  for (const i in years) {
    for (const j in years[i].months)
      years[i].months[j].s = years[i].months[j].entries.length > 1 ? "s" : "";

    years[i].months = arrayify(years[i].months);
    years[i].s = years[i].total > 1 ? "s" : "";
  }

  return arrayify(years).sort(function (a, b) {
    return parseInt(b.year) - parseInt(a.year);
  });
}

function flattenEntries(years) {
  const entries = [];

  for (const year of years) {
    for (const month of year.months) {
      for (const entry of month.entries) entries.push(entry);
    }
  }

  return entries;
}

async function archives(req, res) {
  const key = createCacheKey(req.blog);

  let years;

  if (archivesCache.has(key)) {
    years = cloneYears(archivesCache.get(key));
  } else {
    const allEntries = await getAllCached(req.blog);
    years = buildYears(allEntries, req.blog.timeZone);
    archivesCache.set(key, deepFreeze(cloneYears(years)));
  }

  // dateStamp is always kept, so the year/month grouping above is unaffected
  // by which entries came from the cache vs. a fresh grouping.
  projectEntryFields(flattenEntries(years), req.retrieve, ["archives"]);

  return years;
};

module.exports = asRetriever(archives);
module.exports._createCacheKey = createCacheKey;
module.exports._clear = function () {
  archivesCache.clear();
};
