import { join, resolve, sep } from "path";
import { iCloudDriveDirectory } from "../config.js";
import clfdate from "../util/clfdate.js";
import normalizeMacserverPath from "./normalizeMacserverPath.js";
import * as brctl from "../brctl/index.js";
import { unwatch, watch } from "../watcher/index.js";

export default async (req, res) => {
  const blogID = req.header("blogID");
  const pathBase64 = req.header("pathBase64");
  const path = pathBase64
    ? Buffer.from(pathBase64, "base64").toString("utf8")
    : "";
  const normalizedPath = normalizeMacserverPath(path);

  // Validate required headers
  if (!blogID || !pathBase64 || !path) {
    console.error(
      clfdate(),
      "Missing required headers for evict request",
      { blogID, pathBase64, path }
    );
    return res
      .status(400)
      .send("Missing required headers: blogID or path");
  }

  console.log(clfdate(), `Received evict request for blogID: ${blogID}, path: ${path}`);

  const basePath = resolve(join(iCloudDriveDirectory, blogID));
  const filePath = resolve(basePath, normalizedPath);

  if (filePath !== basePath && !filePath.startsWith(basePath + sep)) {
    console.error(
      clfdate(),
      "Invalid path: attempted to access parent directory",
      basePath,
      filePath
    );
    return res.status(400).send("Path escapes blog directory");
  }

  // first unwatch the blogID to prevent further events from being triggered
  try {
    await unwatch(blogID);
  } catch (error) {
    console.error(clfdate(), `Failed to unwatch blogID (${blogID}):`, error);
    return res.status(500).send("Failed to unwatch blog folder");
  }

  try {
    await brctl.evict(filePath);

    console.log(clfdate(), `Handled file eviction: ${filePath}`);
  } catch (error) {
    console.error(clfdate(), `Failed to evict file (${filePath}):`, error);
    return res.status(500).send("Failed to evict file");
  } finally {
    // re-watch the blogID
    try {
      await watch(blogID);
    } catch (error) {
      console.error(clfdate(), `Failed to rewatch blogID (${blogID}):`, error);
    }
  }

  res.sendStatus(200);
};
