const fs = require("fs-extra");
const { join } = require("path");
const { iCloudDriveDirectory } = require("../config");
const { ls } = require("../brctl");
const shouldIgnoreFile = require('../../../util/shouldIgnoreFile');

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const path = Buffer.from(req.header("pathBase64"), "base64").toString("utf8");

  if (!blogID || !path) {
    return res.status(400).send("Missing blogID or path header");
  }

  console.log(`Received readdir request for blogID: ${blogID}, path: ${path}`);

  const dirPath = join(iCloudDriveDirectory, blogID, path);

  // first we issue a request to ls to ensure the directory is downloaded
  // otherwise, files or subdirectories may be missing. if this stops working
  // you can use brctl monitor -p [path] to force iCloud to sync the directory
  // listing (this will not download the files, just the list of contents)
  try {
    await ls(dirPath);
  } catch (error) {
    console.error("Error listing directory:", dirPath, error);
  }

  // now that we are sure the directory is in sync, we can read it
  const files = await fs.readdir(dirPath, { withFileTypes: true });

  // Ignore system files and directories we don't want to sync
  const filteredFiles = files.filter((file) => !shouldIgnoreFile(file.name));

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
