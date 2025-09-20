const { iCloudDriveDirectory } = require("../config");
const exec = require("../exec");

// This can be used to force the mac to fetch the contents of the path
// assuming it is a directory. To sync a file, use `brctl download`
// It won't download the files in the directory, just the list of files
// It does not work recursively, so if there are subdirectories you need
// to call it on those too. This is used to a solve a problem where sub
// directories where not syncing, and not even showing up using fs.readdir
module.exports = async (path) => {

  console.log(`Issuing brctl monitor for path: ${path}`);

  if (!path.startsWith(iCloudDriveDirectory)) {
    throw new Error(`Path not in iCloud: ${path}`);
  }

  // -p says exit once the information has been fetched
  const { stdout, stderr } = await exec("brctl", ["monitor", "-p", path]);

  // stdout looks like for directories:

  // observing in /Users/admin/Library/Mobile Documents/com~apple~CloudDocs/blog_e4830654946c4dfdadaccef4cbe7d001/subdirectory/untitled folder 2 for the docs|data|external scope(s)
  // 2025-09-19 15:38:43 +0000 total:1
  //  o /missing folder ☁ not downloaded ➕  by Me 👥  by David Merfield (rw)
  // 
  // 2025-09-19 15:38:43 +0000 gathering done in 0.109s

  // and for files:

  // 2025-09-19 15:51:57 +0000 total:0
  // 
  // 2025-09-19 15:51:57 +0000 gathering done in 0.032s

  if (stderr !== "") {
    throw new Error(`Unexpected stderr: ${stderr}`);
  }

  console.log(`brctl monitor complete for path: ${path}`);
  console.log("-----");
  console.log(stdout);
  console.log("-----");

  return stdout;
};