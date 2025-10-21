const localPath = require("helper/localPath");
const establishSyncLock = require("../../util/establishSyncLock");
const fs = require("fs-extra");

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

    console.log(`Deleting file for blogID: ${blogID}, path: ${filePath}`);

    // Establish sync lock to allow safe file operations
    const { done, folder } = await establishSyncLock(blogID);

    try {
      // Compute the local file path on disk
      const pathOnDisk = localPath(blogID, filePath);

      console.log(`Deleting file at: ${pathOnDisk}`);

      // Remove the file (if it exists)
      await fs.remove(pathOnDisk); // Removes the file or directory

      // Call the folder's update method to register the file deletion
      await folder.update(filePath);

      // Set the folder status to reflect the delete action
      folder.status("Removed " + filePath);

      console.log(`File successfully deleted: ${pathOnDisk}`);
      res.status(200).send(`File successfully deleted for blogID: ${blogID}`);
    } catch (err) {
      if (err.code === "ENOENT") {
        // File does not exist
        console.warn(`File not found: ${filePath}`);
        res.status(404).send("File not found");
      } else {
        throw err; // Re-throw unexpected errors
      }
    } finally {
      // Release the sync lock
      done();
    }
  } catch (err) {
    console.error("Error in /delete:", err);
    res.status(500).send("Internal Server Error");
  }
};
