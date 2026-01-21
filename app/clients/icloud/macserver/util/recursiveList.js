import path from "path";
import { ls } from "../brctl/index.js";
import shouldIgnoreFile from "../../../util/shouldIgnoreFile.js";
import clfdate from "./clfdate.js";

const MAX_DEPTH = 1000;

async function recursiveList(dirPath, depth = 0) {
  if (depth > MAX_DEPTH) {
    console.warn(clfdate(), `Maximum depth ${MAX_DEPTH} reached at ${dirPath}`);
    return;
  }

  console.log(clfdate(), `ls: ${dirPath}`);

  try {
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

export default recursiveList;
