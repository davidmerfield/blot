var Candidates = require("./candidates");
var async = require("async");
var Create = require("./create");
var Transformer = require("helper/transformer");
var STORE_PREFIX = "thumbnails";
var debug = require("debug")("blot:entry:build:thumbnail");

module.exports = function (blog, path, metadata, html, callback) {
  var store, candidates, create;

  // Attempt to build a list of candidate image
  // src and paths based on the content of the
  // html generated from the blog post and the
  // metadata extracted from the blog post.
  try {
    candidates = Candidates(metadata, html);
  } catch (e) {
    return callback(e);
  }

  debug(blog.id, path, candidates);

  store = new Transformer(blog.id, STORE_PREFIX);
  create = Create.bind(this, blog.id);

  async.eachSeries(
    candidates,
    function (candidate, next) {
      store.lookup(candidate, create, function (err, thumbnails) {
        // We don't care if a candidate produces an error
        // we just keep going on down the list...
        if (err) {
          debug(err);
        }

        debug(blog.id, candidate, err, thumbnails);

        // Little bit hacky to pass thumbnails
        // as first argument. This stops async
        next(thumbnails);
      });
    },
    function (thumbnails) {
      debug(blog.id, "final thumbnails", thumbnails);

      callback(null, thumbnails);
    }
  );
};
