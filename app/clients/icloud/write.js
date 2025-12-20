const localPath = require("helper/localPath");
const fs = require("fs-extra");
const remoteUpload = require("./sync/util/remoteUpload");
const shouldIgnoreFile = require("clients/util/shouldIgnoreFile");

module.exports = async (blogID, path, contents, callback) => {
  if (shouldIgnoreFile(path)) {
    return callback(new Error(`Cannot write ignored file: ${path}`));
  }

  const pathOnBlot = localPath(blogID, path);

  try {
    await fs.outputFile(pathOnBlot, contents);
    await remoteUpload(blogID, path);
  } catch (error) {
    console.error(`Error writing to ${pathOnBlot}:`, error);
    return callback(error);
  }

  callback();
};
