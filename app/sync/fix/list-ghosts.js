const Entry = require("models/entry");
const Entries = require("models/entries");
const client = require("models/client");
const async = require("async");

var lists = ["all", "created", "entries", "drafts", "scheduled", "pages"];

function main(blog, callback) {
  const report = [];

  Entries.pruneMissing(blog.id, function (err) {
    if (err) return callback(err);

    async.each(
      lists,
      function (list, next) {
        client.zrevrange("blog:" + blog.id + ":" + list, 0, -1, function (
          err,
          res
        ) {
          if (err) return next(err);
          async.each(
            res,
            function (id, next) {
              Entry.get(blog.id, id, function (entry) {
                if (entry && entry.id === id) return next();

                report.push([list, "MISMATCH", id]);
                client.zrem("blog:" + blog.id + ":" + list, id, function (err) {
                  if (err) return next(err);
                  if (!entry) return next();
                  Entry.set(blog.id, entry.id, entry, next);
                });
              });
            },
            next
          );
        });
      },
      function (err) {
        if (err) return callback(err);
        callback(null, report);
      }
    );
  });
}

module.exports = main;
