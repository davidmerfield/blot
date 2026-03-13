const scheduler = require("node-schedule");
const scheduled = new Map();
var ensure = require("helper/ensure");
var model = require("./model");

module.exports = function (blogID, entry, callback) {
  ensure(blogID, "string").and(entry, model).and(callback, "function");

  var set = require("./set");

  // Refresh will perform a re-save of the entry
  var refresh = set.bind(this, blogID, entry.path, {}, function () {
    require("models/blog").set(blogID, { cacheID: Date.now() }, function (err) {
      console.log(
        "Blog:",
        blogID + ":",
        "Published entry as scheduled!",
        entry.path
      );
    });
  });

  // Use a deterministic key to ensure one scheduled job per entry path.
  // We reschedule whenever the entry's publication date changes.
  var key = [blogID, entry.path].join(":");
  var existing = scheduled.get(key);

  if (existing) {
    existing.cancel();
    scheduled.delete(key);
  }

  // If the entry is scheduled for future publication,
  // register an event to update the entry. This is
  // neccessary to switch the 'scheduled' flag
  if (!entry.scheduled) return callback();

  var at = new Date(entry.dateStamp);
  var job = scheduler.scheduleJob(at, refresh);

  if (job) {
    scheduled.set(key, job);

    job.on("run", function () {
      scheduled.delete(key);
    });

    job.on("canceled", function () {
      scheduled.delete(key);
    });
  }

  return callback();
};
