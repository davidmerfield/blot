import { iCloudDriveDirectory } from "../config.js";
import fs from "fs-extra";
import exec from "../exec.js";

const TIMEOUT = 10 * 1000; // 10 seconds
const POLLING_INTERVAL = 200; // 200 ms

export default async (path, options = {}) => {
  const timeoutMs = options.timeoutMs ?? TIMEOUT;

  const stat = await fs.stat(path);
  const start = Date.now();

  if (!path.startsWith(iCloudDriveDirectory)) {
    throw new Error(`File not in iCloud Drive: ${path}`);
  }

  const expectedBlocks = 0;
  const isEvicted = stat.blocks === expectedBlocks;

  // we only consider whether or not files are evicted, not directories
  if (isEvicted && !stat.isDirectory()) {
    return stat;
  }

  const pathInDrive = path.replace(iCloudDriveDirectory, "").slice(1);

  const { stdout, stderr } = await exec("brctl", ["evict", pathInDrive], {
    cwd: iCloudDriveDirectory,
  });

  if (stdout !== "evicted content of '" + pathInDrive + "'\n") {
    throw new Error(`Unexpected stdout: ${stdout}`);
  }

  if (stderr !== "") {
    throw new Error(`Unexpected stderr: ${stderr}`);
  }

  while (Date.now() - start < timeoutMs) {
    const stat = await fs.stat(path);

    if (stat.blocks === expectedBlocks) {
      return stat;
    } else {
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
    }
  }

  throw new Error(`Timeout downloading file: ${path}`);
};
