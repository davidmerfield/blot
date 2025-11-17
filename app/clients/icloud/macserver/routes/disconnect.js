const fs = require("fs-extra");
const { join } = require("path");
const { iCloudDriveDirectory } = require("../config");
const { removeLimiterForBlogID } = require("../limiters");

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

  console.log(`Received disconnect request for blogID: ${blogID}`);

  // remove the blogid folder and the limiter
  removeLimiterForBlogID(blogID);
  
  await fs.remove(join(iCloudDriveDirectory, blogID));

  console.log(`Disconnected blogID: ${blogID}`);

  res.sendStatus(200);
};
