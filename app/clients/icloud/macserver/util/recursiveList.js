import path from "path";
import { ls } from "../brctl/index.js";
import shouldIgnoreFile from "../../../util/shouldIgnoreFile.js";
import clfdate from "./clfdate.js";

const MAX_DEPTH = 1000;
const UPDATE_INTERVAL = 5000; // milliseconds

const inFlightByDirPath = new Map();

async function recursiveList(dirPath, depth = 0) {
  try {
    if (depth > MAX_DEPTH) {
      console.warn(clfdate(), `Maximum depth ${MAX_DEPTH} reached at ${dirPath}`);
      return;
    }

    const contents = await ls(dirPath);

    if (!contents || contents.trim() === "") {
      console.warn(clfdate(), `No contents for directory: ${dirPath}`);
      return;
    }

    const dirs = contents
      .split("\n")
      .filter((line) => line.endsWith("/"))
      .map((line) => line.slice(0, -1))
      .filter((name) => name !== "." && name !== "..")
      .filter((name) => !shouldIgnoreFile(name))
      .map((name) => path.join(dirPath, name));

    for (const subDir of dirs) {
      await recursiveList(subDir, depth + 1);
    }
  } catch (error) {
    console.error(clfdate(), "Error processing directory", dirPath, error);
  }
}

function startRun(dirPath, entry) {
  console.log(clfdate(), `Starting recursive list: ${dirPath}`);
  
  const startTime = Date.now();
  let progressInterval;

  entry.inFlight = (async () => {
    // Track progress with time-based updates
    progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      console.log(clfdate(), `Progress: ${Math.round(elapsed / 1000)}s elapsed, processing: ${dirPath}`);
    }, UPDATE_INTERVAL);

    try {
      await recursiveList(dirPath);
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    }
  })();

  entry.inFlight.finally(() => {
    if (progressInterval) {
      clearInterval(progressInterval);
    }
    const elapsed = Date.now() - startTime;
    console.log(clfdate(), `Completed recursive list: ${dirPath} (${Math.round(elapsed / 1000)}s elapsed)`);
    
    if (entry.rerunRequested) {
      entry.rerunRequested = false;
      startRun(dirPath, entry);
    } else {
      inFlightByDirPath.delete(dirPath);
    }
  });
}

function recursiveListDebounced(dirPath) {
  const existing = inFlightByDirPath.get(dirPath);

  if (existing) {
    existing.rerunRequested = true;
    return existing.inFlight;
  }

  const entry = { inFlight: null, rerunRequested: false };
  inFlightByDirPath.set(dirPath, entry);
  startRun(dirPath, entry);
  return entry.inFlight;
}

export { recursiveListDebounced };
export default recursiveListDebounced;
