var async = require("async");
var client = require("models/client");
var config = require("config");
var fs = require("fs-extra");
var get = require("./get");
var set = require("./set");
var key = require("./key");
var BackupDomain = require("./util/backupDomain");
var flushCache = require("./flushCache");

var START_CURSOR = "0";
var SCAN_SIZE = 1000;
var BLOG_ID_REGEX = /^blog_[a-f0-9]+$/;
var TRACE_PREFIX = "[blog.remove]";

function isValidBlogID(blogID) {
  return typeof blogID === "string" && BLOG_ID_REGEX.test(blogID);
}

function remove(blogID, callback) {
  var started = Date.now();
  var traceID = blogID + ":" + started;

  function log() {
    var args = Array.prototype.slice.call(arguments);
    console.log.apply(console, [TRACE_PREFIX, traceID].concat(args));
  }

  log("start");

  if (!isValidBlogID(blogID)) return callback(new Error("Invalid blog id"));

  get({ id: blogID }, function (err, blog) {
    log("get callback", err ? err.message : "ok", blog && blog.id);
    if (err || !blog || !blog.id) return callback(err || new Error("No blog"));

    // We need to enable the blog to disconnect the client
    // since we need to acquire a sync lock...
    set(blogID, { isDisabled: false }, function (err) {
      log("set isDisabled:false callback", err ? err.message : "ok");
      if (err) return callback(err);

      flushCache(blogID, function (err) {
        log("flushCache callback", err ? err.message : "ok");
        if (err) return callback(err);

        // The order of these tasks is important right now.
        // For example, if you wipe the blog's folder before disconnecting
        // the client, you might run into an error. It would be nice to
        // be able to run them in parallel though
        var tasks = [disconnectClient, updateUser, wipeFolders, deleteKeys].map(
          function (task) {
            return task.bind(null, blog);
          }
        );

        async.series(tasks, function (err) {
          log(
            "async.series complete",
            err ? err.message : "ok",
            Date.now() - started + "ms"
          );
          callback(err, blog);
        });
      });
    });
  });
}

function wipeFolders(blog, callback) {
  console.log(TRACE_PREFIX, blog.id, "wipeFolders start");
  if (!blog.id || typeof blog.id !== "string")
    return callback(new Error("Invalid blog id"));

  var blogFolder = config.blog_folder_dir + "/" + blog.id;
  var staticFolder = config.blog_static_files_dir + "/" + blog.id;

  async.parallel(
    [
      safelyRemove.bind(null, blogFolder, config.blog_folder_dir),
      safelyRemove.bind(null, staticFolder, config.blog_static_files_dir),
    ],
    function (err) {
      console.log(
        TRACE_PREFIX,
        blog.id,
        "wipeFolders done",
        err ? err.message : "ok"
      );
      callback(err);
    }
  );

  // This could get messy if the blog.id is an empty
  // string or if it somehow resolves to the blog folder
  // so we do a few more steps to ensure we're only ever deleting
  // a folder inside the particular directory and nothing else
  function safelyRemove(folder, root, callback) {
    fs.realpath(folder, function (err, realpathToFolder) {
      // This folder does not exist, so no need to do anything
      if (err && err.code === "ENOENT") return callback();

      if (err) return callback(err);

      fs.realpath(root, function (err, realpathToRoot) {
        if (err) return callback(err);

        if (realpathToFolder.indexOf(realpathToRoot + "/") !== 0)
          return callback(
            new Error("Could not safely remove directory:" + folder)
          );

        fs.remove(realpathToFolder, callback);
      });
    });
  }
}

function deleteKeys(blog, callback) {
  console.log(TRACE_PREFIX, blog.id, "deleteKeys start");
  var multi = client.multi();

  var patterns = ["template:" + blog.id + ":*", "blog:" + blog.id + ":*"];

  var remove = ["template:owned_by:" + blog.id];

  if (blog.handle) {
    remove.push("handle:" + blog.handle);
    remove.push("domain:" + blog.handle + "." + config.host);
  }

  // TODO ALSO remove alternate key with/out 'www', e.g. www.example.com
  if (blog.domain) {
    remove.push("domain:" + blog.domain);
    remove.push("domain:" + BackupDomain(blog.domain));
  }

  async.each(
    patterns,
    function (pattern, next) {
      var args = [START_CURSOR, "MATCH", pattern, "COUNT", SCAN_SIZE];
      console.log(TRACE_PREFIX, blog.id, "scan pattern start", pattern);

      client.scan(args, function then(err, res) {
        if (err) return next(err);

        if (!res || !Array.isArray(res) || res.length < 2) {
          return next(new Error("Unexpected SCAN reply: " + JSON.stringify(res)));
        }

        // the cursor for the next pass
        args[0] = res[0];

        // Append the keys we matched in the last pass
        remove = remove.concat(res[1]);
        console.log(
          TRACE_PREFIX,
          blog.id,
          "scan chunk",
          pattern,
          "cursor",
          res[0],
          "keys",
          Array.isArray(res[1]) ? res[1].length : "invalid"
        );

        // There are more keys to check, so keep going
        if (res[0] !== START_CURSOR) return client.scan(args, then);

        console.log(TRACE_PREFIX, blog.id, "scan pattern done", pattern);
        next();
      });
    },
    function (err) {
      if (err) {
        console.log(TRACE_PREFIX, blog.id, "deleteKeys scan error", err.message);
        return callback(err);
      }

      console.log(TRACE_PREFIX, blog.id, "deleteKeys multi.del size", remove.length);
      multi.del(remove);
      multi.srem(key.ids, blog.id);
      multi.exec(function (err) {
        console.log(
          TRACE_PREFIX,
          blog.id,
          "deleteKeys exec done",
          err ? err.message : "ok"
        );
        callback(err);
      });
    }
  );
}

function disconnectClient(blog, callback) {
  console.log(TRACE_PREFIX, blog.id, "disconnectClient start", blog.client || "none");
  var clients = require("clients");

  if (!blog.client || !clients[blog.client]) return callback(null);

  clients[blog.client].disconnect(blog.id, function(err){

    // we still want to continue even if there is an error
    if (err) {
      console.error('Error disconnecting client:', err);
    }

    console.log(TRACE_PREFIX, blog.id, "disconnectClient done");
    callback(null);
  });
}

function updateUser(blog, callback) {
  console.log(TRACE_PREFIX, blog.id, "updateUser start", blog.owner);
  var User = require("models/user");
  User.getById(blog.owner, function (err, user) {
    if (err) return callback(err);

    // If the user has already been deleted then
    // we don't need to worry about this.
    if (!user || !user.blogs) {
      console.log(TRACE_PREFIX, blog.id, "updateUser no-user-or-blogs");
      return callback();
    }

    var changes = {};

    var blogs = user.blogs.slice();

    blogs = blogs.filter(function (otherBlogID) {
      return otherBlogID !== blog.id;
    });

    changes.blogs = blogs;

    if (user.lastSession === blog.id) changes.lastSession = "";

    User.set(blog.owner, changes, function (err) {
      console.log(
        TRACE_PREFIX,
        blog.id,
        "updateUser done",
        err ? err.message : "ok"
      );
      callback(err);
    });
  });
}

module.exports = remove;
