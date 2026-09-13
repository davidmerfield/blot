import { execFile } from "child_process";
import { iCloudDriveDirectory } from "../config.js";
import clfdate from "../util/clfdate.js";

const POLL_INTERVAL = 15 * 1000; // Check every 15 seconds
const MAX_DISK_USAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

// Tracks the last filesystem-driven update time for each blog
const blogUpdateTimes = new Map();

// We don't use ../exec because it can't tolerate stderr or non-zero exit codes
// which happens when there is a file in someone's folder with a name that's too
// long and produces du:  File name too long
const getDiskUsage = () => {
  return new Promise((resolve, reject) => {
    // Run du -sk <dir> with stderr redirected to /dev/null
    execFile(
      "du",
      ["-sk", iCloudDriveDirectory],
      { stdio: ["ignore", "pipe", "ignore"] }, // [stdin, stdout, stderr]
      (_error, stdout) => {
        if (!stdout) {
          return reject(new Error("No output from du command"));
        }

        try {
          // Parse output
          const bytes = parseInt(stdout.split("\t")[0]) * 1024;
          resolve(bytes);
        } catch (parseError) {
          reject(new Error(`Error parsing du output: ${parseError.message}`));
        }
      }
    );
  });
};

const markBlogUpdated = (blogID, observedTimeMs = Date.now()) => {
  blogUpdateTimes.set(blogID, observedTimeMs);
};

const removeBlog = (blogID) => {
  blogUpdateTimes.delete(blogID);
};

// Sort blogs by their last update time (least recently updated first)
const sortBlogsByUpdateTime = () => {
  return Array.from(blogUpdateTimes.entries()).sort(([, timeA], [, timeB]) => timeA - timeB);
};

const check = async (evictBlogDirectory) => {
  let diskUsage = await getDiskUsage();

  if (diskUsage < MAX_DISK_USAGE_BYTES) {
    return;
  }

  const bytesToEvict = diskUsage - MAX_DISK_USAGE_BYTES;

  console.warn(
    clfdate(),
    `Disk usage is above threshold: ${diskUsage} bytes, need to evict ${bytesToEvict} bytes`
  );

  const sortedBlogs = sortBlogsByUpdateTime();
  for (const [blogID] of sortedBlogs) {
    await evictBlogDirectory(blogID);

    diskUsage = await getDiskUsage();

    if (diskUsage < MAX_DISK_USAGE_BYTES) {
      return;
    }
  }

  console.warn(clfdate(), `Disk usage is still above threshold: ${diskUsage} bytes`);
};

const checkDiskSpace = (evictBlogDirectory) => {
  setInterval(() => {
    check(evictBlogDirectory).catch((error) => {
      console.error(clfdate(), `Disk space check failed: ${error}`);
    });
  }, POLL_INTERVAL);
};

export { checkDiskSpace, markBlogUpdated, removeBlog };
