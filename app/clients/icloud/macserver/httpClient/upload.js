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
const clfdate = require("../../util/clfdate");

module.exports = async (blogID, path) => {
  // Input validation
  if (!blogID || typeof blogID !== "string") {
    throw new Error("Invalid blogID");
  }

  if (!path || typeof path !== "string") {
    throw new Error("Invalid path");
  }

  const filePath = join(iCloudDriveDirectory, blogID, path);

  console.log(clfdate(), `Preparing to upload file: ${filePath}`);
  
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
  console.log(clfdate(), `Reading file into memory: ${filePath}`);

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

  console.log(clfdate(), `Issuing HTTP /upload request to remote server: ${path}`);

  const response = await fetch(`${remoteServer}/upload`, {
    // we use a larger timeout for uploads since they involve building a potentially expensive entry
    // even if the upload itself is fast
    timeout: 60 * 1000,
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

  if (!response.ok) {
    throw new Error(
      `Upload failed: ${response.status}`
    );
  }

  const text = await response.text();

  console.log(clfdate(), "Upload successful:", text);
};
