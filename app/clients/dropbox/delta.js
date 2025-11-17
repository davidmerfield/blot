var debug = require("debug")("blot:clients:dropbox:delta");
var retry = require("./util/retry");
var waitForErrorTimeout = require("./util/waitForErrorTimeout");
var isDotfileOrDotfolder = require("./util/constants").isDotfileOrDotfolder;

// The goal of this function is to retrieve a list of changes made
// to the blog folder inside a user's Dropbox folder. We add a new
// property relative_path to each change. This property refers to
// the path the change relative to the folder for this blog.
module.exports = function delta(client, folderID) {
  function get(cursor, callback) {
    var requests = [];
    var result = {};

    if (cursor) {
      // We pass in a tag which tells Dropbox what we know
      // to be the previous state of a user's folder
      // so we don't get everything every time...
      requests.push(client.filesListFolderContinue({ cursor: cursor }));
    } else {
      // Dropbox likes root as empty string,
      // so if there is no folder ID this is fine
      // We obviously want to know about removed files
      // We want to know about changes anywhere in the folder
      requests.push(
        client.filesListFolder({
          path: folderID,
          include_deleted: true,
          recursive: true,
        })
      );
    }

    // folderID will be an empty string if the blog is set up as
    // root directory of the folder to which Blot has access.
    if (folderID) {
      // The reason we look up the metadata for the blog's folder
      // is to make sure we can filter the list of all changes to
      // only those made to the blog folder. We pass the ID instead
      // of the folder path because the user may rename the folder.
      requests.push(client.filesGetMetadata({ path: folderID }));
    }

    Promise.all(requests)
      .then(function (results) {
        result = results[0].result;

        if (results[1]) {
          result.path_display = results[1].result.path_display;
        }

        // Filter entries to only those changes applied
        // to the blog folder and compute the relative
        // path of each change inside the blog folder.
        if (result.path_display) {
          result.entries = result.entries
            .filter(function (entry) {
              return (
                entry.path_display.indexOf(result.path_display) === 0 &&
                entry.path_display !== result.path_display
              );
            })
            .map(function (entry) {
              entry.relative_path = entry.path_display.slice(
                result.path_display.length
              );
              return entry;
            })
            .filter(function (entry) {
              return !isDotfileOrDotfolder(entry.relative_path);
            });
        } else {
          result.entries = result.entries
            .map(function (entry) {
              entry.relative_path = entry.path_display;
              return entry;
            })
            .filter(function (entry) {
              return !isDotfileOrDotfolder(entry.relative_path);
            });
        }

        callback(null, result);
      })

      // Handle 429 Errors from Dropbox which ask us
      // to wait a certain number of seconds before retrying
      .catch(waitForErrorTimeout)

      .catch(function (err) {
        var message, error;

        // Professional programmers wrote this SDK
        // Anyway, reset typically means the folder
        // has moved and we need to reset the cursor
        // and sync from scratch.
        if (
          err.error &&
          err.error.error &&
          err.error.error[".tag"] === "reset"
        ) {
          cursor = "";
          return get(cursor, callback);
        }

        // Determine the error message to pass back
        // to sync. We might show this to the user.
        if (err.status === 409) {
          message = "Your folder no longer exists";
        } else {
          message = "Failed to fetch changes from Dropbox";
        }

        error = new Error(message);
        error.status = err.status || 400;

        callback(error, null);
      });
  }

  // Removed the timeout since it
  return retry(get);
};
