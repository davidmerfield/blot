const Sync = require("sync");
const Blog = require("models/blog");
const async = require("async");
const config = require("config");
const chokidar = require("chokidar");
const shouldIgnoreFile = require("clients/util/shouldIgnoreFile");
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
  const debounceInterval = 50;
  const maximumBatchSize = 100;
  const pendingPaths = [];
  let flushTimer;

  // We want to queue up and process batches in order while holding the sync
  // lock for a bounded amount of work.
  const queue = async.queue(function (paths, callback) {
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

        let batchError;

        async.eachSeries(
          paths,
          function (path, next) {
            folder.update(path, function (err) {
              if (err && !batchError) batchError = err;
              next();
            });
          },
          function () {
            done(batchError, function (err) {
              callback(err || batchError);
            });
          }
        );
      });
    });
  });

  queue.error = function (err) {
    console.error(prefix(), "Unable to process watcher batch", blogID, err);
  };

  function flushPendingPaths() {
    flushTimer = undefined;

    const snapshot = pendingPaths.splice(0, maximumBatchSize);
    const paths = snapshot.filter(
      (path, index) => snapshot.indexOf(path) === index
    );

    if (paths.length) queue.push(paths);
    if (pendingPaths.length) scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushPendingPaths, debounceInterval);
  }

  try {
    if (watchers[blogID]) return;

    // To stop this watcher, call watcher.close();
    const watcher = chokidar.watch(localPath(blogID, "/"), {
      cwd: localPath(blogID, "/"),
      ignored: shouldIgnoreFile,
      ignoreInitial: true,
    });

    watcher.on("all", (event, path) => {
      if (!path) return;
      // Blot likes leading slashes
      path = "/" + path;
      pendingPaths.push(path);
      scheduleFlush();
    });

    watchers[blogID] = watcher;
  } catch (e) {
    return console.error(e);
  }
}

module.exports = setup;
