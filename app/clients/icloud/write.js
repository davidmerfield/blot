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
    const uploaded = await remoteUpload(blogID, path);
    if (!uploaded) {
      const error = new Error(`Failed to upload ${path} to remote`);
      console.error(`Error writing to ${pathOnBlot}:`, error);
      return callback(error);
    }
    await fs.outputFile(pathOnBlot, contents);
  } catch (error) {
    console.error(`Error writing to ${pathOnBlot}:`, error);
    return callback(error);
  }

  callback();
};
