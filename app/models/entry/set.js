var async = require("async");
var ensure = require("helper/ensure");
var model = require("./model");
var redis = require("models/client");
var guid = require("helper/guid");
var clfdate = require("helper/clfdate");
var debug = require("debug")("blot:entry:set");
var get = require("./get");
var key = require("./key");
var setUrl = require("./_setUrl");

// Queue items
var rebuildDependencyGraph = require("./_rebuildDependencyGraph");
var backlinksToUpdate = require("./_backlinksToUpdate");
var updateTagList = require("models/tags").set;
var addToSchedule = require("./_addToSchedule");
var notifyDrafts = require("./_notifyDrafts");
var assignToLists = require("./_assign");

// Set is a private method which takes any valid
// properties in the updates param and then overwrites those.
// Also updates entry properties which affect data stored
// elsewhere such as created date, permalink etc..
module.exports = function set (blogID, path, updates, callback) {
  ensure(blogID, "string")
    .and(path, "string")
    .and(updates, "object")
    .and(callback, "function");

  var entryKey = key.entry(blogID, path);
  var queue;

  debug("set", blogID, path);

  // Get the entry stored against this ID
  get(blogID, path, function (entry) {
    // Create an empty object if new entry
    entry = entry || {};

    var previousPermalink = entry.permalink;

    var previousInternalLinks = entry.internalLinks
      ? entry.internalLinks.slice()
      : [];

    var previousDependencies = entry.dependencies
      ? entry.dependencies.slice()
      : [];

    // Overwrite any updates to the entry
    for (var i in updates) entry[i] = updates[i];

    var dateStampWasRemoved = entry.dateStampWasRemoved;

    if (dateStampWasRemoved) {
      delete entry.dateStamp;
    }

    if (entry.guid === undefined) entry.guid = "entry_" + guid();

    // This is for new entries
    if (entry.created === undefined) {
      entry.created = Date.now();
    }

    if (entry.dateStamp === undefined) {
      entry.dateStamp = entry.created;
    }

    // ToDO remove these and ensure all existing entries have been rebuilt
    if (entry.dependencies === undefined) entry.dependencies = [];
    if (entry.backlinks === undefined) entry.backlinks = [];
    if (entry.internalLinks === undefined) entry.internalLinks = [];
    if (!entry.metadata || typeof entry.metadata !== "object") entry.metadata = {};
    if (!entry.exif || typeof entry.exif !== "object") entry.exif = {};

    entry.scheduled = entry.dateStamp > Date.now();

    delete entry.dateStampWasRemoved;

    // Draft entries should not be in the
    // menu or scheduled list
    if (entry.draft) {
      entry.menu = entry.page = entry.scheduled = false;
    }

    // Scheduled entries should not be in the menu
    if (entry.scheduled) {
      entry.menu = entry.page = false;
    }

    // Deleted entries not be in the menu,
    // drafts folder or scheduled list
    if (entry.deleted) {
      entry.menu = entry.page = entry.draft = entry.scheduled = false;
    }

    debug("set", blogID, path, "calling setUrl");

    setUrl(blogID, entry, function (err, url) {
      // Should be pretty serious (i.e. issue with DB)
      if (err) return callback(err);

      debug("set", blogID, path, "setUrl returned", url);

      // URL will be an empty string for
      // drafts, scheduled entries and deleted entries
      entry.url = url;

      // Ensures entry has all the
      // keys it should have and no more
      ensure(entry, model, true);

      // Store the entry
      redis.set(entryKey, JSON.stringify(entry), function (err) {
        if (err) return callback(err);

        var ttlAction = entry.deleted
          ? function (next) {
              redis.expire(entryKey, 24 * 60 * 60, function (err, result) {
                if (err) return next(err);
                if (!result)
                  return next(
                    new Error("Failed to set expiration for deleted entry")
                  );
                next();
              });
            }
          : function (next) {
              redis.persist(entryKey, function (err) {
                if (err) return next(err);
                next();
              });
            };

        ttlAction(function (err) {
          if (err) return callback(err);

          queue = [
          updateTagList.bind(this, blogID, entry),
          assignToLists.bind(this, blogID, entry),
          rebuildDependencyGraph.bind(this, blogID, entry, previousDependencies)
        ];

        if (entry.scheduled)
          queue.push(addToSchedule.bind(this, blogID, entry));

        if (entry.draft) queue.push(notifyDrafts.bind(this, blogID, entry));

          async.parallel(queue, function (err) {
            if (err) return callback(err);
            backlinksToUpdate(
              blogID,
              entry,
              previousInternalLinks,
              previousPermalink,
              function (err, changes) {
                if (err) return callback(err);

                if (changes.length)
                  console.log(
                    clfdate(),
                    blogID.slice(0, 12),
                    "updating backlinks:",
                    path
                  );
                async.eachOf(
                  changes,
                  function (backlinks, linkedEntryPath, next) {
                    console.log(
                      clfdate(),
                      blogID.slice(0, 12),
                      "    - linked entry:",
                      linkedEntryPath
                    );
                    set(blogID, linkedEntryPath, { backlinks }, function (err) {
                      if (err) {
                        console.log(
                          clfdate(),
                          blogID.slice(0, 12),
                          "    - error updating linked entry:",
                          linkedEntryPath
                        );
                        console.log(err);
                      }
                      next();
                    });
                  },
                  function (err) {
                    if (err) return callback(err);
                    if (entry.deleted) {
                      console.log(clfdate(), blogID.slice(0, 12), "delete", path);
                    } else {
                      console.log(clfdate(), blogID.slice(0, 12), "update", path);
                    }
                    callback();
                  }
                );
              }
            );
          });
        });
      });
    });
  });
};
