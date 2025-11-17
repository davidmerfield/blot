var Tags = require("models/tags");
var Entry = require("models/entry");
var async = require("async");
var client = require("models/client");

module.exports = function main(blog, callback) {
  const report = [];
  Tags.list(blog.id, function (err, tags) {
    async.eachSeries(
      tags,
      function (tag, next) {
        Tags.get(blog.id, tag.slug, function (err, entryIDs) {
          if (err) return next(err);

          const tagKey = Tags.key.sortedTag(blog.id, tag.slug);

          if (!entryIDs.length) {
            report.push(["EMPTY TAG", tag]);
            const multi = client.multi();
            multi.srem(Tags.key.all(blog.id), tag.slug);
            multi.del(tagKey);
            return multi.exec(next);
          }

          async.each(
            entryIDs,
            function (entryID, next) {
              Entry.get(blog.id, entryID, function (entry) {
                if (!entry) {
                  report.push(["MISSING", entryID]);
                  const multi = client.multi();
                  multi.zrem(tagKey, entryID);
                  return multi.exec(next);
                }

                if (entry.id === entryID) return next();

                report.push(["MISMATCH", entryID, entry.id]);
                var multi = client.multi();
                var entryKeyForIncorrectID = Tags.key.entry(blog.id, entryID);
                var entryKeyForCorrectID = Tags.key.entry(blog.id, entry.id);
                var score = entry.dateStamp;
                if (typeof score !== "number" || isNaN(score)) {
                  score = Date.now();
                }

                multi.rename(entryKeyForIncorrectID, entryKeyForCorrectID);
                multi.zrem(tagKey, entryID);
                multi.zadd(tagKey, score, entry.id);
                multi.exec(function (err) {
                  if (err) return next(err);
                  Entry.set(blog.id, entry.id, entry, next);
                });
              });
            },
            next,
          );
        });
      },
      function (err) {
        if (err) return callback(err);
        callback(null, report);
      },
    );
  });
};
