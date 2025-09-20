const fs = require("fs-extra");
const { join } = require("path");
const { iCloudDriveDirectory } = require("../config");
const brctl = require("../brctl");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const path = Buffer.from(req.header("pathBase64"), "base64").toString("utf8");

  if (!blogID || !path) {
    return res.status(400).send("Missing blogID or path header");
  }

  console.log(`Received readdir request for blogID: ${blogID}, path: ${path}`);

  const dirPath = join(iCloudDriveDirectory, blogID, path);

  // first we issue a request to brctl to ensure the directory is downloaded
  // otherwise, files or subdirectories may be missing. we might be able to simply
  // issue a 'ls' command instead of a full monitor... to investigate
  await brctl.monitor(dirPath);
  
  // now that we are sure the directory is in sync, we can read it
  const files = await fs.readdir(dirPath, { withFileTypes: true });

  // Ignore dotfiles and directories
  const filteredFiles = files.filter((file) => !file.name.startsWith("."));

  const result = [];

  for (const file of filteredFiles) {
    const filePath = join(dirPath, file.name);
    const stat = await fs.stat(filePath);

    const modifiedTime = stat.mtime.toISOString();
    const size = stat.size;
    const isDirectory = file.isDirectory();

    result.push({
      name: file.name,
      isDirectory,
      size: isDirectory ? undefined : size,
      modifiedTime: isDirectory ? undefined : modifiedTime,
    });
  }

  console.log(`Readdir complete for blogID: ${blogID}, path: ${path}`);
  console.log(result);
  res.json(result);
};
