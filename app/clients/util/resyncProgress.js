const fs = require("fs-extra");
const { join } = require("path");

async function countLocalFiles(directory) {
  let total = 0;
  const contents = await fs.readdir(directory, { withFileTypes: true });

  for (const item of contents) {
    const path = join(directory, item.name);
    if (item.isDirectory()) total += await countLocalFiles(path);
    else total += 1;
  }

  return total;
}

function createProgress(total, publish) {
  const progress = { current: 0, total };

  progress.publish = function (message, path, additional) {
    if (additional) progress.total += 1;
    progress.current = Math.min(progress.current + 1, progress.total);
    publish(`(${progress.current}/${progress.total}) ${message} ${path}`);
  };

  progress.finish = function (message) {
    progress.current = progress.total;
    publish(`(${progress.current}/${progress.total}) ${message}`);
  };

  return progress;
}

module.exports = { countLocalFiles, createProgress };
