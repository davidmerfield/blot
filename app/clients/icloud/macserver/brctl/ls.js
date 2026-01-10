const { iCloudDriveDirectory } = require("../config");
const exec = require("../exec");

const CONFIG = {
  TIMEOUT: 5 * 1000,
  POLLING_INTERVAL: 200,
  ERROR_MESSAGES: {
    DEADLOCK: "Resource deadlock avoided",
    NO_FILE: "No such file or directory"
  }
};

const handleExecError = (error, dirPath) => {
  if (!error?.message) return null;
  
  if (error.message.includes(CONFIG.ERROR_MESSAGES.NO_FILE)) {
    console.warn(`Directory does not exist: ${dirPath}`);
    return null;
  }
  
  if (!error.message.includes(CONFIG.ERROR_MESSAGES.DEADLOCK)) {
    console.error(`Unexpected error listing directory ${dirPath}: ${error.message}`);
    return null;
  }
  
  return error;  // Return deadlock error for handling
};

const listDirectory = async (dirPath) => {
  try {
    const { stdout, stderr } = await exec("ls", ["-la1F", dirPath]);
    if (stderr) throw new Error(`Error listing directory ${dirPath}: ${stderr}`);
    return stdout;
  } catch (error) {
    throw error;
  }
};

module.exports = async (dirPath) => {
  try {
    return await listDirectory(dirPath);
  } catch (error) {
    const handledError = handleExecError(error, dirPath);
    if (!handledError) return null;

    // Handle deadlock by downloading
    try {
      console.log(`Directory not downloaded, downloading: ${dirPath}`);
      const pathInDrive = dirPath.replace(iCloudDriveDirectory, "").slice(1);
      await exec("brctl", ["download", pathInDrive], {
        cwd: iCloudDriveDirectory,
      });
    } catch (error) {
      console.error(`Error downloading directory ${dirPath}: ${error.message}`);
      return null;
    }

    const start = Date.now();
    while (Date.now() - start < CONFIG.TIMEOUT) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.POLLING_INTERVAL));
      
      try {
        return await listDirectory(dirPath);
      } catch (error) {
        const handledError = handleExecError(error, dirPath);
        if (!handledError) return null;
        // Continue polling on deadlock
      }
    }

    console.error(`Timeout listing directory ${dirPath}`);
    return null;
  }
};
