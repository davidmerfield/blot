var async = require("async");
var ensure = require("helper/ensure");
var setBlog = require("models/blog/set");
var set = require("./set");

module.exports = function enable(user, updates, callback) {
  if (typeof updates === "function") {
    callback = updates;
    updates = {};
  }

  updates = updates || {};
  callback = callback || function () {};

  ensure(user, "object");
  ensure(updates, "object");
  ensure(callback, "function");

  var blogs = Array.isArray(user.blogs) ? user.blogs.slice() : [];

  updates.isDisabled = false;

  set(user.uid, updates, function (err) {
    if (err) return callback(err);

    async.each(
      blogs,
      function (blogID, next) {
        setBlog(blogID, { isDisabled: false }, next);
      },
      callback
    );
  });
};
