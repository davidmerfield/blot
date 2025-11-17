var async = require("async");
var ensure = require("helper/ensure");

var addIgnore = require("models/ignoredFiles").add;
var dropEntry = require("models/entry").drop;

module.exports = function (blogID, path, reason, callback) {
  ensure(blogID, "string")
    .and(path, "string")
    .and(reason, "string")
    .and(callback, "function");

  // Remove this file from the user's blog
  // and from the folder on the server.
  var queue = [
    addIgnore.bind(this, blogID, path, reason),
    dropEntry.bind(this, blogID, path),
  ];

  async.eachSeries(
    queue,
    function (method, next) {
      method(next);
    },
    callback
  );
};
