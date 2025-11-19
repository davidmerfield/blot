const path = require("path");
const { ls } = require("../brctl");
const shouldIgnoreFile = require("../../../util/shouldIgnoreFile");

const MAX_DEPTH = 1000;

async function recursiveList(dirPath, depth = 0) {
  if (depth > MAX_DEPTH) {
    console.warn(`Maximum depth ${MAX_DEPTH} reached at ${dirPath}`);
    return;
  }

  console.log(`ls: ${dirPath}`);

  try {
    const contents = await ls(dirPath);

    if (!contents || contents.trim() === "") {
      console.warn(`No contents for directory: ${dirPath}`);
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
    console.error("Error processing directory", dirPath, error);
  }
}

module.exports = recursiveList;
