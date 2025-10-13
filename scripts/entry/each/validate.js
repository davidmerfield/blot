var Entry = require("models/entry");
var eachEntry = require("../../each/entry");

var _ = require("lodash");
var assert = require("assert");

var ensure = require("helper/ensure");
var options = require("minimist")(process.argv.slice(2));

var debug = require("./debug");
var colors = require("colors/safe");
var fix = require("./fix");

eachEntry(
  function (user, blog, entry, next) {
    console.log(colors.dim(blog.id + " " + entry.guid), entry.path);
    const before = JSON.stringify(entry);
    fix(blog, entry, function (entry, changes) {
      ensure(entry, Entry.model, true);
      const after = JSON.stringify(entry);

      if (_.isEqual(before, after)) return next();

      Entry.set(blog.id, entry.id, entry, function (err) {
        if (err) throw err;

        Entry.get(blog.id, entry.id, function (err, savedEntry) {
          if (err) return next(err);
          // The entry changed, lets work out
          // why before continuing
          if (!_.isEqual(savedEntry, entry)) {
            return debug(entry, savedEntry, changes, next);
          }

          assert.deepEqual(savedEntry, entry);
          next();
        });
      });
    });
  },
  process.exit,
  options
);
