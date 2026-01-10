const localPath = require("helper/localPath");
const fs = require("fs-extra");
const remoteDelete = require("./sync/util/remoteDelete");

module.exports = async (blogID, path, callback) => {
  const pathOnBlot = localPath(blogID, path);

  try {
    const deleted = await remoteDelete(blogID, path);
    if (!deleted) {
      const error = new Error(`Failed to delete ${path} from remote`);
      console.error(`Error removing ${pathOnBlot}:`, error);
      return callback(error);
    }
    await fs.remove(pathOnBlot);
  } catch (error) {
    console.error(`Error removing ${pathOnBlot}:`, error);
    return callback(error);
  }

  callback();
};
