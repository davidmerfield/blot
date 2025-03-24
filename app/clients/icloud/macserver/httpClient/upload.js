const {
  remoteServer,
  Authorization,
  iCloudDriveDirectory,
  maxFileSize,
} = require("../config");

const fs = require("fs-extra");
const brctl = require("../brctl");
const fetch = require("./rateLimitedFetchWithRetriesAndTimeout");
const { join } = require("path");

module.exports = async (blogID, path) => {
  // Input validation
  if (!blogID || typeof blogID !== "string") {
    throw new Error("Invalid blogID");
  }

  if (!path || typeof path !== "string") {
    throw new Error("Invalid path");
  }

  const filePath = join(iCloudDriveDirectory, blogID, path);

  // Download and check file
  let stat;
  try {
    stat = await brctl.download(filePath);
  } catch (e) {
    throw new Error(`Download failed: ${e.message}`);
  }

  if (stat.size > maxFileSize) {
    throw new Error(`File size exceeds maximum of ${maxFileSize} bytes`);
  }

  const modifiedTime = stat.mtime.toISOString();

  // Read entire file into memory
  console.log(`Reading file into memory: ${filePath}`);

  // Beware: if you try and rewrite this to use streams you also have to
  // update rateLimitedFetchWithRetriesAndTimeout to re-create the stream
  // correctly for subsequent retries otherwise the stream will be in a
  // bad state and will not work correctly
  let fileBuffer;
  try {
    fileBuffer = await fs.readFile(filePath);
  } catch (error) {
    throw new Error(`Failed to read file: ${error.message}`);
  }

  const pathBase64 = Buffer.from(path).toString("base64");

  console.log(`Issuing HTTP /upload request to remote server: ${path}`);

  await fetch(`${remoteServer}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      Authorization,
      blogID,
      pathBase64,
      modifiedTime,
    },
    body: fileBuffer,
  });
  console.log("Upload successful", path);
};
