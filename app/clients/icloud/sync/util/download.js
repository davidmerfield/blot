const config = require("config");
const MAC_SERVER_ADDRESS = config.icloud.server_address;
const MACSERVER_AUTH = config.icloud.secret; // The Macserver Authorization secret from config
const localPath = require("helper/localPath");
const fs = require("fs-extra");
const fetch = require("../../util/rateLimitedFetchWithRetriesAndTimeout");


module.exports = async (blogID, path) => {
  const pathBase64 = Buffer.from(path).toString("base64");
  const res = await fetch(MAC_SERVER_ADDRESS + "/download", {
    headers: { Authorization: MACSERVER_AUTH, blogID, pathBase64 },
  });

  // the modifiedTime header is sent by the server
  const modifiedTime = res.headers.get("modifiedTime");
  if (!modifiedTime) {
    throw new Error(`Missing modifiedTime header for ${path}`);
  }

  // Validate that modifiedTime is a valid date string
  const modifiedDate = new Date(modifiedTime);
  if (isNaN(modifiedDate.getTime())) {
    throw new Error(`Invalid modifiedTime header value for ${path}: ${modifiedTime}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const pathOnDisk = localPath(blogID, path);
  await fs.outputFile(pathOnDisk, buffer);
  await fs.utimes(pathOnDisk, modifiedDate, modifiedDate);
  return pathOnDisk;
};
