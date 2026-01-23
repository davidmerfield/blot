import path from "path";
import { ls } from "../brctl/index.js";
import shouldIgnoreFile from "../../../util/shouldIgnoreFile.js";
import clfdate from "./clfdate.js";

const MAX_DEPTH = 1000;
const UPDATE_INTERVAL = 50;

async function recursiveList(dirPath, depth = 0, stats = { directoriesProcessed: 0 }) {
  const isTopLevel = depth === 0;

  if (isTopLevel) {
    console.log(clfdate(), `Starting recursive list: ${dirPath}`);
  }

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

    stats.directoriesProcessed++;

    if (stats.directoriesProcessed % UPDATE_INTERVAL === 0) {
      console.log(clfdate(), `Progress: ${stats.directoriesProcessed} directories processed current directory: ${dirPath}`);
    }

    for (const subDir of dirs) {
      await recursiveList(subDir, depth + 1, stats);
    }
  } catch (error) {
    console.error(clfdate(), "Error processing directory", dirPath, error);
  } finally {
    if (isTopLevel) {
      console.log(clfdate(), `Completed recursive list: ${dirPath} (${stats.directoriesProcessed} directories processed)`);
    }
  }
}

export default recursiveList;
