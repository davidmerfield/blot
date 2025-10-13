var redis = require("models/client");
var async = require("async");
var ensure = require("helper/ensure");
var Entry = require("../entry");
var DateStamp = require("../../build/prepare/dateStamp");
var Blog = require("../blog");

module.exports = (function () {
  var lists = [
    "all",
    "created",
    "entries",
    "drafts",
    "scheduled",
    "pages",
    "deleted",
  ];

  function resave(blogID, callback) {
    Blog.get({ id: blogID }, function (err, blog) {
      if (err || !blog) return callback(err || new Error("no blog"));

      each(
        blogID,
        function (entry, nextEntry) {
          var dateStamp = DateStamp(blog, entry.path, entry.metadata);
          var changes = {};

          // This is fine!
          if (dateStamp !== undefined) changes.dateStamp = dateStamp;

          // We now need to save every entry so that
          // changes to permalink format take effect.
          Entry.set(blogID, entry.path, changes, nextEntry);
        },
        callback
      );
    });
  }

  function adjacentTo(blogID, entryID, callback) {
    ensure(blogID, "string").and(entryID, "string").and(callback, "function");

    // Get the index of the entry in the list of entries
    redis.zrank(listKey(blogID, "entries"), entryID, function (error, rank) {
      if (error) return callback(error);

      // If the entry has no rank its not got siblings
      // make sure you don't just bang rank, 0 is falsy in JS!
      if (typeof rank !== "number") return callback(null);

      var lowerBound = rank > 0 ? rank - 1 : 0;

      redis.zrange(
        listKey(blogID, "entries"),
        lowerBound,
        rank + 1,
        function (error, entryIDs) {
          if (error) return callback(error);

          Entry.get(blogID, entryIDs, function (err, entries) {
            if (err) return callback(err);
            // {skinny: true},

            var next, previous;

            if (entries.length) {
              previous = entries[0].id != entryID ? entries[0] : undefined;
              next =
                entries[entries.length - 1].id != entryID
                  ? entries[entries.length - 1]
                  : undefined;
            }

            return callback(null, next, previous, ++rank);
          });
        }
      );
    });
  }

  function getTotal(blogID, callback) {
    var entriesKey = listKey(blogID, "entries");

    redis.zcard(entriesKey, callback);
  }

  // includes deleted entries
  function getAllIDs(blogID, callback) {
    var allKey = listKey(blogID, "all");

    redis.zrevrange(allKey, 0, -1, callback);
  }

  // includes deleted entries
  function getAll(blogID, options, callback) {
    if (typeof options === "function" && !callback) {
      callback = options;
      options = {};
    }

    ensure(blogID, "string").and(options, "object").and(callback, "function");

    // By default retrieve skinnier
    // entry info when getting every entry
    if (options.skinny === undefined) options.skinny = true;

    return getRange(blogID, 0, -1, options, callback);
  }

  function get(blogID, options, callback) {
    ensure(blogID, "string").and(callback, "function");

    if (!options.lists && options.list) options.lists = [options.list];

    ensure(options.lists, "array");

    // Skinny is true by default
    options.skinny = options.skinny !== false;

    var response = {},
      lists = options.lists.slice(),
      totalToFetch = lists.length,
      completed = 0,
      finished = false;

    delete options.lists;

    if (!totalToFetch) {
      return callback(null, response);
    }

    for (var i in lists) {
      options.list = lists[i];
      getRange(blogID, 0, -1, options, onComplete(options.list));
    }

    function onComplete(listName) {
      return function (err, listOfEntries) {
        if (finished) return;

        if (err) {
          finished = true;
          return callback(err);
        }

        response[listName] = listOfEntries;
        completed++;

        if (completed === totalToFetch) {
          finished = true;
          callback(null, response);
        }
      };
    }
  }

  function getListIDs(blogID, listName, options, callback) {
    ensure(blogID, "string")
      .and(listName, "string")
      .and(options, "object")
      .and(callback, "function");

    var list = listKey(blogID, listName);

    var start = 0;
    var end = -1;

    if (options.first) {
      start = 0;
      end = options.first - 1;
    }

    redis.zrevrange(list, start, end, function (err, ids) {
      if (err) return callback(err);

      return callback(null, ids);
    });
  }

  // includes deleted entries
  function each(blogID, dothis, callback) {
    ensure(blogID, "string").and(dothis, "function").and(callback, "function");

    redis.zrevrange(listKey(blogID, "all"), 0, -1, function (error, ids) {
      if (error) return callback(error);

      async.eachSeries(
        ids,
        function (id, next) {
          Entry.get(blogID, id, function (err, entry) {
            if (err) return next(err);
            dothis(entry, next);
          });
        },
        callback
      );
    });
  }

  function getCreated(blogID, after, callback) {
    ensure(blogID, "string").and(after, "number").and(callback, "function");

    var key = listKey(blogID, "created");

    redis.ZRANGEBYSCORE(key, after, Date.now(), function (err, ids) {
      if (err) return callback(err);

      Entry.get(blogID, ids, function (entryErr, entries) {
        if (entryErr) return callback(entryErr);
        callback(null, entries || []);
      });
    });
  }

  function getDeleted(blogID, after, callback) {
    ensure(blogID, "string").and(after, "number").and(callback, "function");

    var key = listKey(blogID, "deleted");

    redis.ZRANGEBYSCORE(key, after, Date.now(), function (err, ids) {
      if (err) return callback(err);

      Entry.get(blogID, ids, function (entryErr, entries) {
        if (entryErr) return callback(entryErr);
        callback(null, entries || []);
      });
    });
  }

  function getRange(blogID, start, end, options, callback) {
    ensure(blogID, "string")
      .and(start, "number")
      .and(end, "number")
      .and(options, "object")
      .and(callback, "function");

    var listName = options.list || "entries";
    var key = listKey(blogID, listName);

    redis.zrevrange(key, start, end, function (err, entryIDs) {
      if (err) return callback(err);

      if (!options.full && !options.skinny) return callback(null, entryIDs);

      // options,
      Entry.get(blogID, entryIDs, function (entryErr, entries) {
        if (entryErr) return callback(entryErr);
        return callback(null, entries);
      });
    });
  }
  function getPage(blogID, pageNo, pageSize, callback, options = {}) {
    ensure(blogID, "string")
      .and(pageNo, "number")
      .and(pageSize, "number")
      .and(callback, "function");

    // Default sorting options
    const { sortBy = "date", order = "asc" } = options;

    pageNo--; // zero indexed

    var start = pageNo * pageSize;
    var end = start + (pageSize - 1);

    // Determine how to fetch the sorted list
    if (sortBy === "id") {
      // Sort by entry ID (alphabetically)
      const sortOptions = [
        listKey(blogID, "entries"), // Base key
        "ALPHA", // Sort alphabetically
        order === "desc" ? "DESC" : "ASC", // Sorting order
        "LIMIT",
        start,
        pageSize, // Apply pagination directly
      ];

      redis.sort(sortOptions, function (error, entryIDs) {
        if (error) {
          console.error(error);
          return callback(error);
        }


        redis.zcard(listKey(blogID, "entries"), function (error, totalEntries) {
          if (error) {
            console.error(error);
            return callback(error);
          }
          handlePaginationAndCallback(
            blogID,
            entryIDs,
            totalEntries,
            pageNo,
            pageSize,
            start,
            end,
            callback
          );
        });
      });
    } else {
      // Default sorting by date (Redis scores)
      
      const rangeFn = order === "asc" ? redis.zrevrange.bind(redis) : redis.zrange.bind(redis);

      rangeFn(
        listKey(blogID, "entries"),
        start,
        end,
        function (error, entryIDs) {
          if (error) {
            console.error(error);
            return callback(error);
          }
          redis.zcard(
            listKey(blogID, "entries"),
            function (error, totalEntries) {
              if (error) {
                console.error(error);
                return callback(error);
              }

              handlePaginationAndCallback(
                blogID,
                entryIDs,
                totalEntries,
                pageNo,
                pageSize,
                start,
                end,
                callback
              );
            }
          );
        }
      );
    }
  }

  /**
   * Handles pagination and invokes the callback with the appropriate data.
   */
  function handlePaginationAndCallback(
    blogID,
    entryIDs,
    totalEntries,
    pageNo,
    pageSize,
    start,
    end,
    callback
  ) {

    Entry.get(blogID, entryIDs, function (err, entries) {
      if (err) return callback(err);

      var pagination = {};

      totalEntries = parseInt(totalEntries);

      pagination.total = Math.ceil(totalEntries / pageSize);
      pagination.current = pageNo + 1;
      pagination.pageSize = pageSize;

      // total entries is not 0 indexed, remove 1
      if (totalEntries - 1 > end) pagination.next = pageNo + 2;

      if (pageNo > 0) pagination.previous = pageNo;

      if (!pagination.next && !pagination.previous) pagination = false;

      // The first entry published should have an index of 1
      // The fifth entry published should have an index of 5
      // The most recently published entry should have an index
      // equal to the number of total entries published.
      let index = totalEntries - start;
      entries.forEach(function (entry) {
        entry.index = index;
        index--;
      });

      return callback(null, entries, pagination);
    });
  }

  function lastUpdate(blogID, callback) {
    getRange(blogID, 0, 1, { skinny: true }, function (err, entries) {
      if (err) return callback(err);
      if (entries && entries.length)
        return callback(null, entries[0].dateStamp);

      return callback(null);
    });
  }

  function getRecent(blogID, callback) {
    getRange(blogID, 0, 30, { skinny: true }, function (err, entries) {
      if (err) return callback(err);
      redis.zcard(listKey(blogID, "entries"), function (error, totalEntries) {
        // We need to add error handling
        if (error) return callback(error);

        // The first entry published should have an index of 1
        // The fifth entry published should have an index of 5
        // The most recently published entry should have an index
        // equal to the number of total entries published.
        let index = totalEntries;
        entries.forEach(function (entry) {
          entry.index = index;
          index--;
        });

        callback(null, entries);
      });
    });
  }

  function listKey(blogID, list) {
    ensure(blogID, "string").and(list, "string");

    if (lists.indexOf(list) === -1)
      throw "There is no valid list with prefix " + list;

    return "blog:" + blogID + ":" + list;
  }

  return {
    get: get,
    resave: resave,
    each: each,
    adjacentTo: adjacentTo,
    getPage: getPage,
    getListIDs: getListIDs,
    getAll: getAll,
    getAllIDs: getAllIDs,
    getTotal: getTotal,
    getRecent: getRecent,
    lastUpdate: lastUpdate,
    getCreated: getCreated,
    getDeleted: getDeleted,
  };
})();
