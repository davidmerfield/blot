require("dotenv").config();

const fs = require("fs-extra");

const remoteServer = process.env.REMOTE_SERVER;
const iCloudDriveDirectory = process.env.ICLOUD_DRIVE_DIRECTORY;
const Authorization = process.env.BLOT_ICLOUD_SERVER_SECRET; // Use the correct environment variable
const maxFileSize = require('../../../config').icloud.maxFileSize; // Maximum file size for iCloud uploads

if (!remoteServer) {
  throw new Error("REMOTE_SERVER is not set");
}

if (!iCloudDriveDirectory) {
  throw new Error("ICLOUD_DRIVE_DIRECTORY is not set");
}

if (!Authorization) {
  throw new Error("BLOT_ICLOUD_SERVER_SECRET is not set");
}

// verify we can read, write and delete files
fs.access(
  iCloudDriveDirectory,
  fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK
)
  .then(() => console.log(`Directory ${iCloudDriveDirectory} is accessible`))
  .catch((err) => {
    console.error(`Directory ${iCloudDriveDirectory} is not accessible:`, err);
    process.exit(1);
  });

module.exports = {
  remoteServer,
  iCloudDriveDirectory,
  Authorization,
  maxFileSize,
};
