import fs from "fs-extra";
import { execFile } from "child_process";
import { iCloudDriveDirectory } from "../config.js";
import clfdate from "../util/clfdate.js";

const POLL_INTERVAL = 15 * 1000; // Check every 15 seconds
const MAX_NUMBER_OF_FILES_TRACKED_PER_BLOG = 1000;
const MAX_DISK_USAGE_BYTES = 30 * 1024 * 1024 * 1024; // 10 GB

// Map to track the largest files and metadata for each blog folder
const largestFilesMap = new Map();
const blogUpdateTimes = new Map(); // Tracks the last update time for each blog

// We don't use ../exec because it can't tolerate stderr or non-zero exit codes
// which happens when there is a file in someone's folder with a name that's too
// long and produces du:  File name too long 
const getDiskUsage = () => {
  return new Promise((resolve, reject) => {
    // Run du -sk <dir> with stderr redirected to /dev/null
    console.log(clfdate(), `Getting disk usage for iCloud Drive...`);
    const child = execFile(
      "du",
      ["-sk", iCloudDriveDirectory],
      { stdio: ["ignore", "pipe", "ignore"] }, // [stdin, stdout, stderr]
      (error, stdout, stderr) => {
        if (!stdout) {
          return reject(new Error(`No output from du command`));
        }

        try {
          console.log(clfdate(), `Disk usage output: ${stdout}`);
          // Parse output
          const bytes = parseInt(stdout.split("\t")[0]) * 1024;
          console.log(clfdate(), `Disk usage: ${bytes} bytes`);
          resolve(bytes);
        } catch (parseError) {
          reject(new Error(`Error parsing du output: ${parseError.message}`));
        }
      }
    );
  });
};

const removeBlog = (blogID) => {
  if (!largestFilesMap.has(blogID)) return;
  largestFilesMap.delete(blogID);
  blogUpdateTimes.delete(blogID); // Remove update time
};

// Updates the map of largest files for a given blogID and tracks update time
const addFile = async (blogID, filePath) => {
  const stat = await fs.stat(filePath);
  const size = stat.size;

  // Initialize blog data if it doesn't exist
  if (!largestFilesMap.has(blogID)) {
    largestFilesMap.set(blogID, []);
  }

  const files = largestFilesMap.get(blogID);

  // Check if the file already exists in the map
  const fileIndex = files.findIndex((file) => file.filePath === filePath);
  if (fileIndex !== -1) {
    // Update the existing file's size and update time
    files[fileIndex].size = size;
    files[fileIndex].ctimeMs = stat.ctimeMs;
    files[fileIndex].mtimeMs = stat.mtimeMs;
  } else {
    // Add the new file with metadata
    files.push({
      filePath,
      size,
      ctimeMs: stat.ctimeMs,
      mtimeMs: stat.mtimeMs,
    });
  }

  // Sort by size (largest first)
  files.sort((a, b) => b.size - a.size);

  // Keep only the top N largest files
  if (files.length > MAX_NUMBER_OF_FILES_TRACKED_PER_BLOG) {
    files.length = MAX_NUMBER_OF_FILES_TRACKED_PER_BLOG;
  }

  largestFilesMap.set(blogID, files);

  // Update the blog's last update time
  const lastUpdateTime = Math.max(
    ...files.map((file) => Math.max(file.ctimeMs, file.mtimeMs))
  );

  blogUpdateTimes.set(blogID, lastUpdateTime);
};

// Removes a file and updates the blog's last update time
const removeFile = (blogID, filePath) => {
  if (!largestFilesMap.has(blogID)) return;

  const files = largestFilesMap
    .get(blogID)
    .filter((file) => file.filePath !== filePath);

  largestFilesMap.set(blogID, files);

  // Update the blog's last update time
  if (files.length > 0) {
    const lastUpdateTime = Math.max(
      ...files.map((file) => Math.max(file.ctimeMs, file.mtimeMs))
    );
    blogUpdateTimes.set(blogID, lastUpdateTime);
  } else {
    blogUpdateTimes.delete(blogID);
  }
};

// Sort blogs by their last update time (least recently updated first)
const sortBlogsByUpdateTime = () => {
  return Array.from(blogUpdateTimes.entries())
    .sort(([, timeA], [, timeB]) => timeA - timeB)
    .map(([blogID]) => blogID);
};

const check = async (evictFiles) => {
  console.log(clfdate(), `Checking free disk space...`);

  let diskUsage = await getDiskUsage();

  if (diskUsage < MAX_DISK_USAGE_BYTES) {
    console.log(clfdate(), 
      `Disk usage is below threshold: ${diskUsage} bytes of ${MAX_DISK_USAGE_BYTES} bytes`
    );
    return;
  }

  let bytesToEvict = diskUsage - MAX_DISK_USAGE_BYTES;

  console.log(clfdate(), 
    `Disk usage is above threshold: ${diskUsage} bytes, need to evict ${bytesToEvict} bytes`
  );

  // Get blogs sorted by least recent update time
  const sortedBlogs = sortBlogsByUpdateTime();

  for (const blogID of sortedBlogs) {
    const lastUpdated = (Date.now() - blogUpdateTimes.get(blogID)) / 1000;
    console.log(clfdate(), 
      `Checking blogID ${blogID} for files to evict, blog was last updated: ${lastUpdated} seconds ago`
    );

    const files = largestFilesMap.get(blogID);
    if (!files || files.length === 0) continue;

    const filesToEvict = [];
    let bytesToBeEvicted = 0;

    for (const { filePath } of files) {
      let stat;

      try {
        stat = await fs.stat(filePath);
      } catch (fileError) {
        console.error(clfdate(), `Error getting file stat: ${fileError}`);
        continue;
      }

      // Skip already evicted files
      if (stat.blocks === 0) {
        // console.info(`Skipping evicted file: ${filePath}`);
        continue;
      }

      filesToEvict.push(filePath);
      bytesToBeEvicted += stat.size;

      if (bytesToBeEvicted >= bytesToEvict) {
        console.log(clfdate(), `Stopping at ${filesToEvict.length} files`);
        break;
      }
    }

    if (filesToEvict.length === 0) {
      console.log(clfdate(), `No files to evict for blogID: ${blogID}`);
      continue;
    }

    console.log(clfdate(), `Evicting ${filesToEvict.length} files for blogID: ${blogID}`);
    await evictFiles(blogID, filesToEvict);
    diskUsage = await getDiskUsage();
    bytesToEvict = diskUsage - MAX_DISK_USAGE_BYTES;

    if (diskUsage < MAX_DISK_USAGE_BYTES) {
      console.log(clfdate(), 
        `Disk usage is now below threshold: ${diskUsage} bytes of ${MAX_DISK_USAGE_BYTES} bytes`
      );
      return;
    }
  }

  console.warn(clfdate(), `Disk usage is still above threshold: ${diskUsage} bytes`);
};

const checkDiskSpace = (evictFiles) => {
  console.log(clfdate(), `Starting disk space monitoring...`);
  setInterval(() => {
    check(evictFiles).catch((error) => {
      console.error(clfdate(), `Disk space check failed: ${error}`);
    });
  }, POLL_INTERVAL);
};

export {
  checkDiskSpace,
  addFile,
  removeFile,
  removeBlog,
};
