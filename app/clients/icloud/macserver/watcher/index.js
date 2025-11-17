const chokidar = require("chokidar");
const fs = require("fs-extra");
const { getLimiterForBlogID } = require("../limiters");
const { iCloudDriveDirectory } = require("../config");
const { constants } = require("fs");
const { join } = require("path");

const brctl = require("../brctl");

const status = require("../httpClient/status");
const upload = require("../httpClient/upload");
const mkdir = require("../httpClient/mkdir");
const remove = require("../httpClient/remove");

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

const {
  checkDiskSpace,
  removeBlog,
  addFile,
  removeFile,
} = require("./monitorDiskUsage");

// Map to track active chokidar watchers for each blog folder
const blogWatchers = new Map();

// Handle file events
const handleFileEvent = async (event, blogID, filePath) => {
  try {
    const pathInBlogDirectory = extractPathInBlogDirectory(filePath);

    // Handle the deletion of the entire blog directory
    if (event === "unlinkDir" && pathInBlogDirectory === "") {
      console.warn(`Blog directory deleted: ${blogID}`);
      await status(blogID, { error: "Blog directory deleted" });
      await unwatch(blogID); // Stop watching this blog folder
      removeBlog(blogID); // Remove from largest files map
      return;
    }

    try {
      // Check if the directory for the blogID exists
      await fs.access(join(iCloudDriveDirectory, blogID), constants.F_OK);
    } catch (err) {
      console.warn(`Ignoring event for unregistered blogID: ${blogID}`);
      return;
    }

    if (!pathInBlogDirectory) {
      console.warn(`Failed to parse path from path: ${filePath}`);
      return;
    }

    console.log(
      `Event: ${event}, blogID: ${blogID}, path: ${pathInBlogDirectory}`,
    );

    // Get the limiter for this specific blogID
    const limiter = getLimiterForBlogID(blogID);

    // Schedule the event handler to run within the limiter
    await limiter.schedule(async () => {
      if (event === "add" || event === "change") {
        await upload(blogID, pathInBlogDirectory);
      } else if (event === "unlink" || event === "unlinkDir") {
        await remove(blogID, pathInBlogDirectory);
      } else if (event === "addDir") {
        await mkdir(blogID, pathInBlogDirectory);
      }
    });
  } catch (error) {
    console.error(`Error handling file event (${event}, ${filePath}):`, error);
  }
};

// Initializes the top-level watcher and starts disk monitoring
const initialize = async () => {
  // Start periodic disk space monitoring
  checkDiskSpace(async (blogID, files) => {
    // Get the limiter for this specific blogID
    const limiter = getLimiterForBlogID(blogID);

    // Schedule the event handler to run within the limiter
    await limiter.schedule(async () => {
      // Unwatch the blogID to prevent file locks during eviction
      await unwatch(blogID);

      for (const filePath of files) {
        await brctl.evict(filePath); // Evict the file
      }

      // Re-watch the blogID after eviction
      await watch(blogID);
    });
  });

  // List all the folders in the iCloudDriveDirectory
  const folderPaths = await fs.readdir(iCloudDriveDirectory, {
    withFileTypes: true,
  });

  // Watch each blog folder
  for (const folder of folderPaths) {
    if (folder.isDirectory()) {
      const blogID = extractBlogID(join(iCloudDriveDirectory, folder.name));
      if (blogID) {
        await watch(blogID);
      } else {
        console.warn(`Ignoring non-blog folder: ${folder.name}`);
      }
    }
  }
};

// Watches a specific blog folder
const watch = async (blogID) => {
  if (blogWatchers.has(blogID)) {
    console.warn(`Already watching blog folder: ${blogID}`);
    return;
  }

  const blogPath = join(iCloudDriveDirectory, blogID);
  let initialScanComplete = false;

  console.log(`Starting watcher for blog folder: ${blogID}`);
  // Monitor the CPU usage on the macserver before and after
  // making any changes to the polling intervals
  const watcher = chokidar
    .watch(blogPath, {
      usePolling: true,
      interval: 250, // Poll every 0.25s for non-binary files
      binaryInterval: 1000, // Poll every 1s for binary files
      ignoreInitial: false, // Process initial events
      ignored: /(^|[/\\])\../, // Ignore dotfiles
    })
    .on("all", (event, filePath) => {
      const blogID = extractBlogID(filePath);

      if (!blogID) {
        console.warn(`Failed to parse blogID from path: ${filePath}`);
        return;
      }

      // Update the internal file map for disk usage monitoring
      if (event === "add" || event === "change") {
        addFile(blogID, filePath);
      } else if (event === "unlink") {
        removeFile(blogID, filePath);
      }

      // We only handle file events after the initial scan is complete
      if (initialScanComplete) {
        handleFileEvent(event, blogID, filePath);
      }
    })
    .on("ready", () => {
      console.log(`Initial scan complete for blog folder: ${blogID}`);
      initialScanComplete = true; // Mark the initial scan as complete
    })
    .on("error", (error) => console.error(`Watcher error: ${error}`));

  blogWatchers.set(blogID, watcher);
};

// Unwatches a specific blog folder
const unwatch = async (blogID) => {
  const watcher = blogWatchers.get(blogID);
  if (!watcher) {
    console.warn(`No active watcher for blog folder: ${blogID}`);
    return;
  }

  console.log(`Stopping watcher for blog folder: ${blogID}`);
  await watcher.close();
  blogWatchers.delete(blogID);
};

module.exports = { initialize, unwatch, watch };
