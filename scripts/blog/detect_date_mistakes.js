const get = require("../get/blog");
const Entry = require("entry");
const Entries = require("entries");
const colors = require("colors");
var getConfirmation = require("../util/getConfirmation");
const async = require("async");
const moment = require("moment");

get(process.argv[2], function (err, user, blog) {
  if (err) throw err;

  loadEntries(blog.id, function (err, { deleted, published }) {
    if (err) throw err;

    async.eachSeries(
      deleted,
      (deletedEntry, next) => {
        console.log("\nChecking deleted entry".dim, deletedEntry.id);

        const candidates = published.filter(
          (publishedEntry) =>
            publishedEntry.title === deletedEntry.title &&
            publishedEntry.dateStamp !== deletedEntry.dateStamp &&
            publishedEntry.created === publishedEntry.dateStamp
        );

        if (!candidates.length) {
          console.log("No candidates found.".dim);
          return next();
        }

        console.log(
          (
            "Date: " +
            moment(deletedEntry.dateStamp).format("MMMM Do YYYY, h:mm:ss a")
          ).dim
        );

        console.log(`Found ${candidates.length} that are live on the site:`);

        async.eachSeries(
          candidates,
          (candidate, nextCandidate) => {
            const message = `         ${candidate.id}
 ${"  title:".dim} ${
              candidate.title[
                candidate.title === deletedEntry.title ? "green" : "red"
              ]
            }
 ${"summary:".dim} ${
              (candidate.summary.slice(0, 20) + "...")[
                candidate.summary === deletedEntry.summary ? "green" : "red"
              ]
            }
 ${"   date:".dim} ${moment(candidate.dateStamp).format(
              "MMMM Do YYYY, h:mm:ss a"
            )}
 use the deleted entry's dateStamp and created date for this entry? (y/n)`;

            getConfirmation(message, function (err, ok) {
              if (!ok) {
                console.log(" skipped".dim);
                return nextCandidate();
              }

              Entry.set(
                blog.id,
                candidate.id,
                {
                  created: deletedEntry.created,
                  dateStamp: deletedEntry.dateStamp,
                },
                next
              );
            });
          },
          next
        );
      },
      function (err) {
        if (err) throw err;
        console.log("Checked all deleted entries!");
        process.exit();
      }
    );
  });
});

function loadEntries(blogID, callback) {
  Entries.get(blogID, { list: "deleted" }, function (err, { deleted }) {
    if (err) return callback(err);

    Entries.getAll(blogID, function (allErr, published) {
      if (allErr) return callback(allErr);

      callback(null, { published, deleted });
    });
  });
}
