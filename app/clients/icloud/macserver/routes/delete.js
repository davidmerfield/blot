const fs = require("fs-extra");
const { join } = require("path");
const { iCloudDriveDirectory } = require("../config");

const { watch, unwatch } = require("../watcher");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const path = Buffer.from(req.header("pathBase64"), "base64").toString("utf8");

  // Validate required headers
  if (!blogID || !path) {
    return res.status(400).send("Missing required headers: blogID or path");
  }

  console.log(`Received delete request for blogID: ${blogID}, path: ${path}`);

  const filePath = join(iCloudDriveDirectory, blogID, path);

  // first unwatch the blogID to prevent further events from being triggered
  await unwatch(blogID);

  let success = false;

  try {
    for (let i = 0; i < 10; i++) {
      try {
        await fs.remove(filePath);
        success = true;
        console.log(`Deleted file: ${filePath}`);
        break;
      } catch (error) {
        success = false;
        console.error(`Failed to delete file (${filePath}):`, error);
        await new Promise((resolve) => setTimeout(resolve, 1000 * i)); // Exponential backoff
      }
    }

    console.log(`Handled file deletion: ${filePath}`);

    if (!success) {
      return res.status(500).send("Failed to delete file after retries");
    }

    return res.sendStatus(200);
  } finally {
    // re-watch the blogID
    await watch(blogID);
  }
};
