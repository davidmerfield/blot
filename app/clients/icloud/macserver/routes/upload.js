const fs = require("fs-extra");
const { join } = require("path");
const { iCloudDriveDirectory } = require("../config");
const { watch, unwatch } = require("../watcher");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const path = Buffer.from(req.header("pathBase64"), "base64").toString("utf8");
  const modifiedTime = req.header("modifiedTime"); // fs.stat.mtimeMs

  if (!blogID || !path || !modifiedTime) {
    return res.status(400).send("Missing blogID, path, or modifiedTime header");
  }

  console.log(`Received upload request for blogID: ${blogID}, path: ${path}`);

  const filePath = join(iCloudDriveDirectory, blogID, path);

  // first unwatch the blogID to prevent further events from being triggered
  await unwatch(blogID);

  let success = false;

  try {
    for (let i = 0; i < 10; i++) {
      try {
        await fs.outputFile(filePath, req.body);
        success = true;
        console.log(`Wrote file: ${filePath}`);
        const modifiedTimeDate = new Date(parseInt(modifiedTime, 10));
        await fs.utimes(filePath, modifiedTimeDate, modifiedTimeDate);
        console.log(`Set modified time for file: ${filePath}`);
        break;
      } catch (error) {
        success = false;
        console.error(`Failed to write file (${filePath}):`, error);
        await new Promise((resolve) => setTimeout(resolve, 1000 * i)); // Exponential backoff
      }
    }

    if (!success) {
      return res.status(500).send("Failed to write file after retries");
    }

    console.log(`Recieved upload of file: ${filePath}`);
    return res.sendStatus(200);
  } finally {
    // re-watch the blogID
    await watch(blogID);
  }
};
