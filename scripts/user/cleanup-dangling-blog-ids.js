/**
 * Reconciles dangling blog IDs in user.blogs and in the global blog index set.
 *
 * Usage:
 *   node scripts/user/cleanup-dangling-blog-ids.js
 */

var async = require("async");
var eachUser = require("../each/user");
var getConfirmation = require("../util/getConfirmation");
var User = require("models/user");
var Blog = require("models/blog");
var blogKey = require("models/blog/key");
var client = require("models/client");

if (require.main === module)
  main(function (err) {
    if (err) throw err;
    process.exit();
  });

function main(callback) {
  var usersScanned = 0;
  var usersFixed = 0;
  var idsRemovedFromUsers = 0;

  eachUser(
    function (user, nextUser) {
      usersScanned += 1;

      var blogs = Array.isArray(user.blogs) ? user.blogs.slice() : [];

      if (!blogs.length) return nextUser();

      var filtered = [];

      async.eachSeries(
        blogs,
        function (id, nextBlog) {
          Blog.get({ id: id }, function (err, blog) {
            if (err) return nextBlog(err);

            if (blog) filtered.push(id);

            nextBlog();
          });
        },
        function (err) {
          if (err) return nextUser(err);

          if (same(blogs, filtered)) return nextUser();

          var removed = blogs.length - filtered.length;

          console.log("\nUser", user.uid, "has", removed, "dangling blog ID(s)");
          console.log("Before:", blogs);
          console.log("After: ", filtered);

          getConfirmation("Persist user.blogs cleanup for " + user.uid + "?", function (err, ok) {
            if (err) return nextUser(err);
            if (!ok) return nextUser();

            User.set(user.uid, { blogs: filtered }, function (err) {
              if (err) return nextUser(err);

              usersFixed += 1;
              idsRemovedFromUsers += removed;
              nextUser();
            });
          });
        }
      );
    },
    function (err) {
      if (err) return callback(err);

      console.log("\nFirst pass complete");
      console.log("Users scanned:", usersScanned);
      console.log("Users fixed:", usersFixed);
      console.log("Dangling IDs removed from users:", idsRemovedFromUsers);

      cleanupDeadBlogIndexIDs(function (err, indexRemoved) {
        if (err) return callback(err);

        console.log("\nSecond pass complete");
        console.log("Dead IDs removed from blog index set:", indexRemoved);

        callback();
      });
    }
  );
}

function cleanupDeadBlogIndexIDs(callback) {
  Blog.getAllIDs(function (err, ids) {
    if (err) return callback(err);

    var deadIDs = [];

    async.eachSeries(
      ids,
      function (id, next) {
        Blog.get({ id: id }, function (err, blog) {
          if (err) return next(err);

          if (!blog) deadIDs.push(id);

          next();
        });
      },
      function (err) {
        if (err) return callback(err);

        if (!deadIDs.length) {
          console.log("No dead IDs found in blog index set.");
          return callback(null, 0);
        }

        console.log("\nFound", deadIDs.length, "dead blog ID(s) in index set:");
        console.log(deadIDs);

        getConfirmation("Remove these dead IDs from the blog index set?", function (err, ok) {
          if (err) return callback(err);

          if (!ok) return callback(null, 0);

          client.srem(blogKey.ids, deadIDs, function (err, removedCount) {
            if (err) return callback(err);

            callback(null, removedCount || 0);
          });
        });
      }
    );
  });
}

function same(a, b) {
  if (a.length !== b.length) return false;

  return a.every(function (id, i) {
    return id === b[i];
  });
}
