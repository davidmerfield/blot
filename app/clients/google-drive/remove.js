const createDriveClient = require("./serviceAccount/createDriveClient");
const localPath = require("helper/localPath");
const fs = require("fs-extra");
const database = require("./database");

module.exports = async function remove(blogID, path, callback) {
  try {
    if (path[0] !== "/") path = "/" + path;

    const { serviceAccountId, folderId } = await database.blog.get(blogID);
    const drive = await createDriveClient(serviceAccountId);
    const { getByPath, remove } = database.folder(folderId, blogID);

    const pathOnBlot = localPath(blogID, path);
    await fs.remove(pathOnBlot);

    const fileId = await getByPath(path);

    if (fileId) {
      await remove(fileId);
      await drive.files.delete({ fileId, supportsAllDrives: true });
    }

    callback(null);
  } catch (e) {
    callback(e);
  }
};
