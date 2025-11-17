const Sync = require("sync");
const Blog = require("models/blog");
const async = require("async");
const config = require("config");
const chokidar = require("chokidar");
const localPath = require("helper/localPath");
const Fix = require("sync/fix");
const clfdate = require("helper/clfdate");
const prefix = () => clfdate() + " Local folder client:";

let watchers = {};

function setup(blogID, callback) {
  Blog.get({ id: blogID }, function (err, blog) {
    if (err || !blog) return callback();
    Fix(blog, function (err) {
      if (err) return callback();
      if (config.environment === "development") {
        watch(blogID);
      }
      console.log(prefix(), "Setup complete", blogID);
      callback();
    });
  });
}

function watch(blogID) {
  // We want to queue up and process in order
  // events from the file system.
  const queue = async.queue(function (path, callback) {
    Blog.get({ id: blogID }, function (err, blog) {
      
      if (err || !blog) {
        if (watchers[blogID]) {
          watchers[blogID].close();
          delete watchers[blogID];
        }
        return callback();
      }
      
      if (blog.client !== "local") {
        if (watchers[blogID]) {
          watchers[blogID].close();
          delete watchers[blogID];
        }
        return callback();
      }

      Sync(blogID, function (err, folder, done) {
        if (err) {
          console.log(err);
          return callback();
        }
        folder.update(path, function (err) {
          done(err, function (err) {
            if (err) return callback(err);
            callback();
          });
        });
      });
    });
  });

  try {
    if (watchers[blogID]) return;

    // To stop this watcher, call watcher.close();
    const watcher = chokidar.watch(localPath(blogID, "/"), {
      cwd: localPath(blogID, "/"),
      ignoreInitial: true,
    });

    watcher.on("all", (event, path) => {
      if (!path) return;
      // Blot likes leading slashes
      path = "/" + path;
      queue.push(path);
    });

    watchers[blogID] = watcher;
  } catch (e) {
    return console.error(e);
  }
}

module.exports = setup;
