var Blog = require("models/blog");
var Entries = require("models/entries");
var async = require("async");
var config = require("config");
var prettyNumber = require("helper/prettyNumber");

function main (callback) {
  var blogs_with_new_entries = [];
  var total_entries = 0;
  var now = Date.now();
  var day = 1000 * 60 * 60 * 24;
  var yesterday = now - day;
  var total_new_entries = 0;

  Blog.getAllIDs(function (err, blogIDs) {
    async.each(
      blogIDs,
      function (blogID, next) {
        Blog.get({ id: blogID }, function (err, blog) {
          if (err) return next(err);
          const new_entries_for_blog = [];
          let newest_entry_created = null;

          Entries.getTotal(blog.id, function (err, total) {
            if (err) return next(err);
            total_entries += total;

            Entries.getRecent(blog.id, function (entries) {
              entries.forEach(function (entry) {
                if (entry.created < yesterday) return;
                if (entry.title) {
                  new_entries_for_blog.push({
                    title: entry.title,
                    link: encodeURI(
                      config.protocol +
                        blog.handle +
                        "." +
                        config.host +
                        entry.url
                    )
                  });
                  newest_entry_created =
                    entry.created > newest_entry_created
                      ? entry.created
                      : newest_entry_created;
                }
              });

              if (new_entries_for_blog.length) {
                blogs_with_new_entries.push({
                  label: blog.title || blog.handle,
                  url: encodeURI(
                    config.protocol + blog.handle + "." + config.host
                  ),
                  newest_entry_created,
                  entries: new_entries_for_blog
                });

                total_new_entries += new_entries_for_blog.length;
              }

              next();
            });
          });
        });
      },
      function (err) {
        // sort the new entries by newest_entry_created
        blogs_with_new_entries.sort(function (a, b) {
          return b.newest_entry_created - a.newest_entry_created;
        });

        callback(err, {
          blogs_with_new_entries,
          total_new_entries,
          total_entries: prettyNumber(total_entries)
        });
      }
    );
  });
}

if (require.main === module) require("./cli")(main);

module.exports = main;
