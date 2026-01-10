const { join, resolve, sep } = require("path");
const { iCloudDriveDirectory } = require("../config");
const clfdate = require("../util/clfdate");
const normalizeMacserverPath = require("./normalizeMacserverPath");

const brctl = require("../brctl");

const { unwatch, watch } = require("../watcher");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const pathBase64 = req.header("pathBase64");
  const path = pathBase64
    ? Buffer.from(pathBase64, "base64").toString("utf8")
    : "";
  const normalizedPath = normalizeMacserverPath(path);

  // Validate required headers
  if (!blogID || !pathBase64 || !path) {
    return res
      .status(400)
      .send("Missing required headers: blogID or path");
  }

  console.log(clfdate(), `Received evict request for blogID: ${blogID}, path: ${path}`);

  const basePath = resolve(join(iCloudDriveDirectory, blogID));
  const filePath = resolve(basePath, normalizedPath);

  if (filePath !== basePath && !filePath.startsWith(basePath + sep)) {
    return res.status(400).send("Path escapes blog directory");
  }

  // first unwatch the blogID to prevent further events from being triggered
  await unwatch(blogID);

  try {
    await brctl.evict(filePath);

    console.log(clfdate(), `Handled file eviction: ${filePath}`);
  } finally {
    // re-watch the blogID
    await watch(blogID);
  }

  res.sendStatus(200);
};
