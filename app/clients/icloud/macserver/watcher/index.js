import chokidar from 'chokidar';
import fs from "fs-extra";
import {
  getLimiterForBlogID,
  removeLimiterForBlogID,
  getLimiterCount,
} from "../limiters.js";
import clfdate from "../util/clfdate.js";
import { iCloudDriveDirectory } from "../config.js";
import { constants } from "fs";
import { join } from "path";
import * as brctl from "../brctl/index.js";
import status from "../httpClient/status.js";
import upload from "../httpClient/upload.js";
import mkdir from "../httpClient/mkdir.js";
import remove from "../httpClient/remove.js";
import resync from "../httpClient/resync.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetries = async (label, operation, options = {}) => {
  const { attempts = 4, baseDelayMs = 200 } = options;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      console.warn(clfdate(), 
        `${label} failed on attempt ${attempt}/${attempts}, retrying in ${delayMs}ms:`,
        error
      );
      await sleep(delayMs);
    }
  }

  console.error(clfdate(), `${label} failed after ${attempts} attempts:`, lastError);
  throw lastError;
};

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

import {
  checkDiskSpace,
  removeBlog,
  addFile,
  removeFile,
} from "./monitorDiskUsage.js";

// Map to track active chokidar watchers for each blog folder
const blogWatchers = new Map();

// Handle file events
const handleFileEvent = async (event, blogID, filePath) => {
  try {
    const pathInBlogDirectory = extractPathInBlogDirectory(filePath);

    // Handle the deletion of the entire blog directory
    if (event === "unlinkDir" && pathInBlogDirectory === "") {
      console.warn(clfdate(), `Blog directory deleted: ${blogID}`);
      const limiterCountBefore = getLimiterCount();
      removeLimiterForBlogID(blogID);
      const limiterCountAfter = getLimiterCount();
      console.assert(
        limiterCountAfter < limiterCountBefore,
        `Expected limiter map size to decrease after deleting ${blogID}. Before: ${limiterCountBefore}, After: ${limiterCountAfter}`
      );
      await status(blogID, { error: "Blog directory deleted" });
      await unwatch(blogID); // Stop watching this blog folder
      removeBlog(blogID); // Remove from largest files map
      return;
    }

    try {
      // Check if the directory for the blogID exists
      await fs.access(join(iCloudDriveDirectory, blogID), constants.F_OK);
    } catch (err) {
      console.warn(clfdate(), `Ignoring event for unregistered blogID: ${blogID}`);
      return;
    }

    if (!pathInBlogDirectory) {
      console.warn(clfdate(), `Failed to parse path from path: ${filePath}`);
      return;
    }

    console.log(clfdate(), 
      `Event: ${event}, blogID: ${blogID}, path: ${pathInBlogDirectory}`
    );

    // Get the limiter for this specific blogID
    const limiter = getLimiterForBlogID(blogID);

    // Schedule the event handler to run within the limiter
    await limiter.schedule(async () => {
      try {
        if (event === "add" || event === "change") {
          await withRetries(
            `upload ${blogID}/${pathInBlogDirectory}`,
            () => upload(blogID, pathInBlogDirectory)
          );
        } else if (event === "unlink" || event === "unlinkDir") {
          await withRetries(
            `remove ${blogID}/${pathInBlogDirectory}`,
            () => remove(blogID, pathInBlogDirectory)
          );
        } else if (event === "addDir") {
          await withRetries(
            `mkdir ${blogID}/${pathInBlogDirectory}`,
            () => mkdir(blogID, pathInBlogDirectory)
          );
        }
      } catch (error) {
        resync(
          blogID,
          `event ${event} for ${pathInBlogDirectory} failed after retries`
        ).catch((resyncError) => {
          console.error(
            clfdate(),
            `Unexpected error requesting resync for blogID: ${blogID}`,
            resyncError
          );
        });
        throw error;
      }
    });
  } catch (error) {
    console.error(clfdate(), `Error handling file event (${event}, ${filePath}):`, error);
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
        try {
          await brctl.evict(filePath); // Evict the file
        } catch (error) {
          // Continue processing files even if eviction of a specific file fails, as brctl evict can intermittently produce errors for certain files.
          console.error(clfdate(), `Failed to evict file (${filePath}):`, error);
        }
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
        console.warn(clfdate(), `Ignoring non-blog folder: ${folder.name}`);
      }
    }
  }
};

// Watches a specific blog folder
const watch = async (blogID) => {
  if (blogWatchers.has(blogID)) {
    console.warn(clfdate(), `Already watching blog folder: ${blogID}`);
    return;
  }

  const blogPath = join(iCloudDriveDirectory, blogID);
  let initialScanComplete = false;

  console.log(clfdate(), `Starting watcher for blog folder: ${blogID}`);
  // Monitor the CPU usage on the macserver before and after
  // making any changes to the polling intervals
  const watcher = chokidar
    .watch(blogPath, {
      usePolling: false, // see if this works now that we're using chokidar 5.0.0
      ignoreInitial: false, // Process initial events
      ignored: /(^|[/\\])\../, // Ignore dotfiles
    })
    .on("all", (event, filePath) => {
      const blogID = extractBlogID(filePath);

      if (!blogID) {
        console.warn(clfdate(), `Failed to parse blogID from path: ${filePath}`);
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
      console.log(clfdate(), `Initial scan complete for blog folder: ${blogID}`);
      initialScanComplete = true; // Mark the initial scan as complete
    })
    .on('error', (error) => console.error(clfdate(), `Watcher error: ${error}`));

  blogWatchers.set(blogID, watcher);
};

// Unwatches a specific blog folder
const unwatch = async (blogID) => {
  const watcher = blogWatchers.get(blogID);
  if (!watcher) {
    console.warn(clfdate(), `No active watcher for blog folder: ${blogID}`);
    return;
  }

  console.log(clfdate(), `Stopping watcher for blog folder: ${blogID}`);
  await watcher.close();
  blogWatchers.delete(blogID);
};

export { initialize, unwatch, watch };
