import * as brctl from "../brctl/index.js";
import { promisify } from "util";
import fs from "fs-extra";
import { statfs as statfsSync } from "fs";
import { iCloudDriveDirectory } from "../config.js";
import clfdate from "../util/clfdate.js";

const statfs = promisify(statfsSync);

export default async (req, res) => {
  const result = {};

  try {
    // get iCloud Drive free space in bytes
    result.icloud_bytes_available = await brctl.quota();
  } catch (error) {
    console.error(clfdate(), `Error getting iCloud Drive quota: ${error}`);
    result.icloud_bytes_available = null;
  }

  try {
    const stats = await statfs('/');
    // get disk free space in bytes
    result.disk_bytes_available = stats.bavail * stats.bsize
  } catch (error) {
    console.error(clfdate(), `Error getting disk free space: ${error}`);
  }

  try {
    // get number of blogs connected
    const blogs = await fs.readdir(iCloudDriveDirectory, {
      withFileTypes: true,
    });

    result.blogs_connected = blogs.filter((blog) => blog.isDirectory()).length;
  } catch (error) {
    console.error(clfdate(), `Error getting number of blogs connected: ${error}`);
  }

  console.log(clfdate(), "Sending stats:", result);
  res.json(result);
};
