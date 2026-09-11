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
  const processed = new Set();

  // `count` lets a caller that disposes of a whole directory in one action
  // (e.g. removing an orphaned local folder with a single fs.remove call)
  // advance current by the number of files that action accounted for,
  // rather than by 1 - otherwise current permanently lags total, which was
  // seeded by counting every file individually.
  progress.publish = function (message, path, additional, count = 1) {
    if (processed.has(path)) return;
    processed.add(path);

    if (additional) progress.total += count;
    progress.current = Math.min(progress.current + count, progress.total);
    publish(`(${progress.current}/${progress.total}) ${message} ${path}`);
  };

  progress.finish = function (message) {
    progress.current = progress.total;
    publish(`(${progress.current}/${progress.total}) ${message}`);
  };

  return progress;
}

module.exports = { countLocalFiles, createProgress };
