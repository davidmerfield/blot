const { iCloudDriveDirectory } = require("../config");
const fs = require("fs-extra");
const exec = require("../exec");
const TIMEOUT = 10 * 1000; // 10 seconds
const POLLING_INTERVAL = 200; // 200 ms
const clfdate = require("helper/clfdate");

module.exports = async (path) => {
  console.log(clfdate(), `Evicting: ${path}`);

  const stat = await fs.stat(path);
  const start = Date.now();

  if (!path.startsWith(iCloudDriveDirectory)) {
    throw new Error(`File not in iCloud Drive: ${path}`);
  }

  const expectedBlocks = 0;
  const isEvicted = stat.blocks === expectedBlocks;

  console.log(clfdate(), `Blocks: ${stat.blocks} / ${expectedBlocks}`);

  if (isEvicted) {
    console.log(clfdate(), `File already evicted: ${path}`);
    return stat;
  }

  const pathInDrive = path.replace(iCloudDriveDirectory, "").slice(1);

  console.log(clfdate(), `Issuing brctl evict for path: ${pathInDrive}`);

  const { stdout, stderr } = await exec("brctl", ["evict", pathInDrive], {
    cwd: iCloudDriveDirectory,
  });

  if (stdout !== "evicted content of '" + pathInDrive + "'\n") {
    throw new Error(`Unexpected stdout: ${stdout}`);
  }

  if (stderr !== "") {
    throw new Error(`Unexpected stderr: ${stderr}`);
  }

  while (Date.now() - start < TIMEOUT) {
    console.log(clfdate(), `Checking evict status: ${path}`);
    const stat = await fs.stat(path);

    console.log(clfdate(), `Blocks: ${stat.blocks} / ${expectedBlocks}`);

    if (stat.blocks === expectedBlocks) {
      console.log(clfdate(), `Eviction complete: ${path}`);
      return stat;
    } else {
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL));
    }
  }

  throw new Error(`Timeout downloading file: ${path}`);
};
