const fs = require("fs-extra");
const ensure = require("helper/ensure");
const type = require("helper/type");
const Update = require("./update");
const async = require("async");
const { join, resolve } = require("path");
const localPath = require("helper/localPath");
const messenger = require("./messenger");
const { blog_static_files_dir } = require("config");
const { promisify } = require("util");
const Transformer = require("helper/transformer");
const Blog = require("models/blog");

function walk(dir, done) {
  var results = [];
  fs.readdir(dir, function (err, list) {
    if (err) return done(err);
    var pending = list.length;
    if (!pending) return done(null, results);
    list.forEach(function (file) {
      file = resolve(dir, file);
      fs.stat(file, function (err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function (err, res) {
            results = results.concat(res);
            if (!--pending) done(null, results);
          });
        } else {
          results.push(file);
          if (!--pending) done(null, results);
        }
      });
    });
  });
}

module.exports = function main(blogID, options, callback) {
  if (type(options, "function") && type(callback, "undefined")) {
    callback = options;
    options = {};
  }

  ensure(blogID, "string").and(options, "object").and(callback, "function");

  Blog.get({ id: blogID }, function (err, blog) {
    if (err || !blog) return callback(err || new Error("No blog"));

    const { log, status } = messenger(blog);
    const update = new Update(blog, log, status);

    let blogDirectory = localPath(blog.id, "/");

    if (blogDirectory.endsWith("/")) blogDirectory = blogDirectory.slice(0, -1);

    walk(blogDirectory, async function (err, paths) {
      if (err) return callback(err);

      try {
        if (options.thumbnails) {
          const directory = join(blog_static_files_dir, blog.id, "_thumbnails");
          await wipeCache({ blogID: blog.id, label: "thumbnails", directory });
        }

        if (options.imageCache) {
          const directory = join(
            blog_static_files_dir,
            blog.id,
            "_image_cache"
          );
          await wipeCache({ blogID: blog.id, label: "image-cache", directory });
        }
      } catch (e) {
        return callback(e);
      }

      async.eachSeries(
        paths,
        function (path, next) {
          path = path.slice(blogDirectory.length);
          update(path, function () {
            // todo: don't swallow error here
            next();
          });
        },
        () => {
          // todo: don't swallow error here
          callback();
        }
      );
    });
  });
};

async function wipeCache({ blogID, label, directory }) {
  const store = new Transformer(blogID, label);
  const flush = promisify(store.flush);

  await flush();
  await fs.emptyDir(directory);
}
