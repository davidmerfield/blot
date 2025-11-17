const localPath = require("helper/localPath");
const establishSyncLock = require("../../util/establishSyncLock");
const fs = require("fs-extra");

module.exports = async function (req, res) {
  try {
    const blogID = req.header("blogID");
    const filePath = Buffer.from(req.header("pathBase64"), "base64").toString(
      "utf8",
    );
    const modifiedTime = req.header("modifiedTime");

    // Validate required headers
    if (!blogID || !filePath) {
      console.warn("Missing required headers: blogID or path");
      return res.status(400).send("Missing required headers: blogID or path");
    }

    console.log(
      `Uploading binary file for blogID: ${blogID}, path: ${filePath}`,
    );

    // Establish sync lock to allow safe file operations
    const { done, folder } = await establishSyncLock(blogID);

    try {
      // Compute the local file path on disk
      const pathOnDisk = localPath(blogID, filePath);

      folder.status("Saving " + filePath);

      // Ensure the directory exists and write the binary data to the file
      // Write the binary data (req.body is raw binary)
      await fs.outputFile(pathOnDisk, req.body);

      // Use the iso string modifiedTime if provided
      if (modifiedTime) {
        const modifiedTimeDate = new Date(modifiedTime);
        await fs.utimes(pathOnDisk, modifiedTimeDate, modifiedTimeDate);
      }

      // Call the folder's update method to register the file change
      await folder.update(filePath);

      // Set the folder status to reflect the upload action
      folder.status("Updated " + filePath);

      console.log(`File successfully written to: ${pathOnDisk}`);
      res.status(200).send(`File successfully uploaded for blogID: ${blogID}`);
    } finally {
      // Release the sync lock
      done();
    }
  } catch (err) {
    console.error("Error in /upload:", err);
    res.status(500).send("Internal Server Error");
  }
};
