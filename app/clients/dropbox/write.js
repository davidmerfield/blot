var join = require("path").join;
var debug = require("debug")("blot:clients:dropbox:write");
var createClient = require("./util/createClient");
var fs = require("fs-extra");
var localPath = require("helper/localPath");
var retry = require("./util/retry");
const { promisify } = require("util");
const upload = promisify(require("clients/dropbox/util/upload"));

// Write should only ever be called inside the function returned
// from Sync for a given blog, since it modifies the blog folder.
function write(blogID, path, contents, callback) {
  var pathInDropbox, pathOnBlot;

  debug("Blog:", blogID, "Writing", path);

  createClient(blogID, async function (err, client, account) {
    if (err || !account) return callback(err || new Error("No account"));

    // We assume that the account's folder has not changed
    // to be perfectly correct, we could check this before
    // each write but it would double the requests needed
    pathInDropbox = join(account.folder || "/", path);

    // We must lowercase this since localPath no longer
    // does and files for the Dropbox client are stored
    // in the folder with a lowercase path.
    pathOnBlot = localPath(blogID, path);

    try {
      await fs.outputFile(pathOnBlot, contents);
      await upload(client, pathOnBlot, pathInDropbox);
    } catch (e) {
      return callback(e);
    }

    callback();
  });
}

module.exports = retry(write);
