import { join } from "path";
import { iCloudDriveDirectory } from "../config.js";

const extractBlogID = (filePath) => {
  if (!filePath.startsWith(iCloudDriveDirectory)) {
    return null;
  }
  const relativePath = filePath.replace(`${iCloudDriveDirectory}/`, "");
  const [blogID] = relativePath.split("/");

  if (!blogID.startsWith("blog_")) {
    return null;
  }

  return blogID;
};

const extractPathInBlogDirectory = (filePath) => {
  if (!filePath.startsWith(iCloudDriveDirectory)) {
    return null;
  }
  const relativePath = filePath.replace(`${iCloudDriveDirectory}/`, "");
  const [, ...restPath] = relativePath.split("/");
  return restPath.join("/");
};

const buildChokidarEventKey = (blogID, pathInBlogDirectory) =>
  `${blogID}:${pathInBlogDirectory}`;

const buildBlogPath = (blogID, pathInBlogDirectory) =>
  join(iCloudDriveDirectory, blogID, pathInBlogDirectory);

export {
  extractBlogID,
  extractPathInBlogDirectory,
  buildChokidarEventKey,
  buildBlogPath,
};
