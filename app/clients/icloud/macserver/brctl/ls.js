import { iCloudDriveDirectory } from "../config.js";
import exec from "../exec.js";
import clfdate from "../util/clfdate.js";

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
    console.warn(clfdate(), `Directory does not exist: ${dirPath}`);
    return null;
  }
  
  if (!error.message.includes(CONFIG.ERROR_MESSAGES.DEADLOCK)) {
    console.error(clfdate(), `Unexpected error listing directory ${dirPath}: ${error.message}`);
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

export default async (dirPath) => {
  try {
    return await listDirectory(dirPath);
  } catch (error) {
    const handledError = handleExecError(error, dirPath);
    if (!handledError) return null;

    // Handle deadlock by downloading
    try {
      console.log(clfdate(), `Directory not downloaded, downloading: ${dirPath}`);
      const pathInDrive = dirPath.replace(iCloudDriveDirectory, "").slice(1);
      await exec("brctl", ["download", pathInDrive], {
        cwd: iCloudDriveDirectory,
      });
    } catch (error) {
      console.error(clfdate(), `Error downloading directory ${dirPath}: ${error.message}`);
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

    console.error(clfdate(), `Timeout listing directory ${dirPath}`);
    return null;
  }
};
