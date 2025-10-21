const fs = require("fs-extra");
const { resolve, join } = require("path");
const { iCloudDriveDirectory } = require("../config");
const { watch, unwatch } = require("../watcher");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const path = Buffer.from(req.header("pathBase64"), "base64").toString("utf8");

  if (!blogID || !path) {
    return res.status(400).send("Missing blogID or path header");
  }

  // Validate path
  const basePath = resolve(join(iCloudDriveDirectory, blogID));
  const dirPath = resolve(join(basePath, path));

  // Check if the resolved path is inside the allowed directory
  if (!dirPath.startsWith(basePath)) {
    console.log(`Invalid path: attempted to access parent directory`, basePath, dirPath);
    return res
      .status(400)
      .send("Invalid path: attempted to access parent directory");
  }

  console.log(`Received mkdir request for blogID: ${blogID}, path: ${path}`);

  const stat = await fs.stat(dirPath).catch(() => null);

  if (stat && stat.isDirectory()) {
    console.log(`Directory already exists: ${dirPath}`);
    return res.sendStatus(200);
  } else if (stat) {
    await fs.remove(dirPath);
  }

  console.log(`Received mkdir request for blogID: ${blogID}, path: ${path}`);

  // first unwatch the blogID to prevent further events from being triggered
  await unwatch(blogID);

  let success = false;
  for (let i = 0; i < 5; i++) {
    try {
      await fs.ensureDir(dirPath);
      console.log(`Created directory: ${dirPath}`);
      success = true;
      break;
    } catch (error) {
      console.error(`Failed to create directory (${dirPath}):`, error);
      if (i < 4) {
        // Only wait if we're going to retry
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, i))
        ); // True exponential backoff
      }
    }
  }

  // re-watch the blogID
  await watch(blogID);

  if (!success) {
    return res
      .status(500)
      .send("Failed to create directory after multiple attempts");
  }

  res.sendStatus(200);
};
