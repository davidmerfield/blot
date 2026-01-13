const { join, resolve, sep } = require("path");
const { iCloudDriveDirectory } = require("../config");
const recursiveList = require("../util/recursiveList");
const clfdate = require("../util/clfdate");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const pathBase64 = req.header("pathBase64");
  const path = pathBase64
    ? Buffer.from(pathBase64, "base64").toString("utf8")
    : "/";

  if (!blogID) {
    console.error(clfdate(), "Missing blogID header for recursiveList request");
    return res.status(400).send("Missing blogID header");
  }
  
  // Validate path
  const basePath = resolve(join(iCloudDriveDirectory, blogID));
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const dirPath = resolve(join(basePath, normalizedPath));

  if (dirPath !== basePath && !dirPath.startsWith(basePath + sep)) {
    console.error(clfdate(), 
      `Invalid path: attempted to access parent directory`,
      basePath,
      dirPath
    );
    return res
      .status(400)
      .send("Invalid path: attempted to access parent directory");
  }

  console.log(clfdate(), 
    `Received recursiveList request for blogID: ${blogID}, path: ${path}`
  );

  try {
    await recursiveList(dirPath, 0);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(clfdate(), "Error performing recursive list", { dirPath, error });
    res.status(500).json({ success: false, error: error.message });
  }
};
