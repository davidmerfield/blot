const config = require("config");
const MAC_SERVER_ADDRESS = config.icloud.server_address;
const Authorization = config.icloud.secret; // The Macserver Authorization secret from config
const localPath = require("helper/localPath");
const fs = require("fs-extra");

module.exports = async (blogID, path) => {
  const pathOnDisk = localPath(blogID, path);
  const stat = await fs.stat(pathOnDisk);
  const modifiedTime = stat.mtimeMs;
  const pathBase64 = Buffer.from(path).toString("base64");

  const body = fs.createReadStream(pathOnDisk);

  console.log('sending', {
    path,
    pathOnDisk,
    modifiedTime,
    pathBase64,
  });
  const res = await fetch(`${MAC_SERVER_ADDRESS}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      Authorization, // Use the Authorization header
      blogID,
      pathBase64,
      modifiedTime,
    },
    body,
    duplex: "half"
  });

  if (!res.ok) {
    throw new Error(`Failed to upload ${path}`);
  }

  return res.ok;
};
