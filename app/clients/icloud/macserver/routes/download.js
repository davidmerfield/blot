const { join, resolve, sep, isAbsolute } = require("path");
const { iCloudDriveDirectory } = require("../config");
const brctl = require('../brctl');
const clfdate = require("../util/clfdate");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const path = Buffer.from(req.header("pathBase64"), "base64").toString("utf8");

  if (!blogID || !path) {
    return res.status(400).send("Missing blogID or path header");
  }

  console.log(clfdate(), `Received download request for blogID: ${blogID}, path: ${path}`);

  try {
    if (isAbsolute(path)) {
      return res
        .status(400)
        .send("Invalid path: absolute paths are not allowed");
    }

    const basePath = resolve(join(iCloudDriveDirectory, blogID));
    const filePath = resolve(join(basePath, path));

    if (filePath !== basePath && !filePath.startsWith(`${basePath}${sep}`)) {
      console.log(clfdate(), 
        "Invalid path: attempted to access parent directory",
        basePath,
        filePath
      );
      return res
        .status(400)
        .send("Invalid path: attempted to access parent directory");
    }

    // first download the file to make sure it's present on the local machine
    const stat = await brctl.download(filePath);
  
    // set the modifiedTime header to the file's modified time as an ISO string
    const modifiedTime = stat.mtime.toISOString();
  
    res.setHeader("modifiedTime", modifiedTime);
    res.download(filePath, path);  
  } catch (err) {
    // handle ENOENT error
    if (err.code === "ENOENT") {
      console.error(clfdate(), "File not found:", err);
      return res.status(404).send("File not found");
    }

    console.error(clfdate(), "Failed to download file:", path, err);
    res.status(500).send("Failed to download file " + path);
  }
};
