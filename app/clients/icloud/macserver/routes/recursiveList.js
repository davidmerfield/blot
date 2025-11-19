const { join } = require("path");
const { iCloudDriveDirectory } = require("../config");
const recursiveList = require("../util/recursiveList");

module.exports = async (req, res) => {
  const blogID = req.header("blogID");
  const pathBase64 = req.header("pathBase64");
  const path = pathBase64
    ? Buffer.from(pathBase64, "base64").toString("utf8")
    : "/";

  if (!blogID) {
    return res.status(400).send("Missing blogID header");
  }
  
  // Remove leading slash if present, or ensure it's relative
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  const dirPath = join(iCloudDriveDirectory, blogID, normalizedPath);

  console.log(
    `Received recursiveList request for blogID: ${blogID}, path: ${path}`
  );

  try {
    await recursiveList(dirPath, 0);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error performing recursive list", { dirPath, error });
    res.status(500).json({ success: false, error: error.message });
  }
};
