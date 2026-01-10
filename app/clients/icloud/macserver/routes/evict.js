const { join } = require("path");
const { iCloudDriveDirectory } = require("../config");

const brctl = require("../brctl");

const { unwatch, watch } = require("../watcher");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const path = Buffer.from(req.header("pathBase64"), "base64").toString("utf8");

  // Validate required headers
  if (!blogID || !path) {
    return res.status(400).send("Missing required headers: blogID or path");
  }

  console.log(`Received evict request for blogID: ${blogID}, path: ${path}`);

  const filePath = join(iCloudDriveDirectory, blogID, path);
  const blogFolder = join(iCloudDriveDirectory, blogID);

  // first unwatch the blogID to prevent further events from being triggered
  await unwatch(blogID);

  try {
    await brctl.evict(filePath);

    console.log(`Handled file eviction: ${filePath}`);
  } finally {
    // re-watch the blogID
    await watch(blogID);
  }

  res.sendStatus(200);
};
