var Entry = require("models/entry");
var blog = require("./blog");
var parseUrl = require("url").parse;

// Takes a URL and fetches the blog, user and entry

module.exports = function get(url, callback) {
  blog(url, function (err, user, blog) {
    if (err) return callback(err);

    url = parseUrl(url);

    // getByUrl fails otherwise. This is probably a flaw?
    url.path = decodeURIComponent(url.path);

    Entry.getByUrl(blog.id, url.path, function (err, entryFromPermalink) {
      if (err) return callback(err);
      Entry.get(blog.id, url.path, function (entryErr, entryFromPath) {
        if (entryErr) return callback(entryErr);
        if (!entryFromPermalink && !entryFromPath)
          return callback(new Error("No entry"), user, blog);

        callback(null, user, blog, entryFromPermalink || entryFromPath);
      });
    });
  });
};
