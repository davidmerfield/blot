const fs = require("fs-extra");
const { join } = require("path");
const { iCloudDriveDirectory } = require("../config");
const { removeLimiterForBlogID } = require("../limiters");
const { unwatch } = require("../watcher");
const clfdate = require("../util/clfdate");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");

  if (!blogID) {
    return res.status(400).send("Missing blogID header");
  }

  // ensure the blogID doesn't container any characters other than
  // letters, numbers and underscores
  if (!/^[a-zA-Z0-9_]+$/.test(blogID)) {
    return res.status(400).send("Invalid blogID");
  }

  console.log(clfdate(), `Received disconnect request for blogID: ${blogID}`);

  // remove the blogid folder and the limiter
  removeLimiterForBlogID(blogID);

  try {
    await unwatch(blogID);
    await fs.remove(join(iCloudDriveDirectory, blogID));
  } catch (error) {
    console.error(clfdate(), `Failed to disconnect blogID ${blogID}:`, error);
    return res.status(500).send(error.message);
  }

  console.log(clfdate(), `Disconnected blogID: ${blogID}`);

  res.sendStatus(200);
};
