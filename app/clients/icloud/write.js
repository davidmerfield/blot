const localPath = require("helper/localPath");
const fs = require("fs-extra");
const remoteUpload = require("./sync/util/remoteUpload");

module.exports = async (blogID, path, contents, callback) => {
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
