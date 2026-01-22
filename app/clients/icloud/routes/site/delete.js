const localPath = require("helper/localPath");
const establishSyncLock = require("sync/establishSyncLock");
const fs = require("fs-extra");
const { handleSyncLockError } = require("../lock");

module.exports = async function (req, res) {
  try {
    const blogID = req.header("blogID");
    const filePath = Buffer.from(req.header("pathBase64"), "base64").toString(
      "utf8"
    );

    // Validate required headers
    if (!blogID || !filePath) {
      return res.status(400).send("Missing required headers: blogID or path");
    }

    // Compute the local file path on disk before taking the lock
    const pathOnDisk = localPath(blogID, filePath);

    if (!(await fs.pathExists(pathOnDisk))) {
      console.warn(`File not found (pre-lock): ${filePath}`);
      return res.sendStatus(204);
    }

    console.log(`Deleting file for blogID: ${blogID}, path: ${filePath}`);

    // Establish sync lock to allow safe file operations
    const { done, folder } = await establishSyncLock(blogID);

    try {
      if (!(await fs.pathExists(pathOnDisk))) {
        console.warn(`File not found (locked): ${filePath}`);
        return res.sendStatus(204);
      }

      console.log(`Deleting file at: ${pathOnDisk}`);

      // Remove the file (if it exists)
      await fs.remove(pathOnDisk); // Removes the file or directory

      // Call the folder's update method to register the file deletion
      await folder.update(filePath);

      // Set the folder status to reflect the delete action
      folder.status("Removed " + filePath);

      console.log(`File successfully deleted: ${pathOnDisk}`);
      return res.status(200).send(`File successfully deleted for blogID: ${blogID}`);
    } finally {
      // Release the sync lock
      done();
    }
  } catch (err) {
    if (
      handleSyncLockError({
        err,
        res,
        blogID: req.header("blogID"),
        action: "delete",
      })
    ) {
      return;
    }

    console.error("Error in /delete:", err);
    res.status(500).send("Internal Server Error");
  }
};
