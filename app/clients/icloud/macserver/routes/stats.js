const brctl = require("../brctl");
const { promisify } = require("util");
const fs = require("fs-extra");
const statfs = promisify(require("fs").statfs);
const { iCloudDriveDirectory } = require("../config");

module.exports = async (req, res) => {
  const result = {};

  try {
    // get iCloud Drive free space in bytes
    result.icloud_bytes_available = await brctl.quota();
  } catch (error) {
    console.error(`Error getting iCloud Drive quota: ${error}`);
  }

  try {
    const stats = await statfs('/');
    // get disk free space in bytes
    result.disk_bytes_available = stats.bavail * stats.bsize
  } catch (error) {
    console.error(`Error getting disk free space: ${error}`);
  }

  try {
    // get number of blogs connected
    const blogs = await fs.readdir(iCloudDriveDirectory, {
      withFileTypes: true,
    });

    result.blogs_connected = blogs.filter((blog) => blog.isDirectory()).length;
  } catch (error) {
    console.error(`Error getting number of blogs connected: ${error}`);
  }

  console.log("Sending stats:", result);
  res.json(result);
};
