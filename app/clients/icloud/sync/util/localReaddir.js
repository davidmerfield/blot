const fs = require("fs-extra");
const { join } = require("path");

const localreaddir = async (dir) => {
  const contents = await fs.readdir(dir);

  // Ignore dotfiles and directories
  const filteredContents = contents.filter((name) => !name.startsWith("."));

  const result = await Promise.all(
    filteredContents.map(async (name) => {
      const path = join(dir, name);
      const stat = await fs.stat(path);

      // Convert the modification time to an ISO string
      const modifiedTime = stat.mtime.toISOString();
      const isDirectory = stat.isDirectory();
      const size = stat.size;

      return {
        name,
        isDirectory,
        size: isDirectory ? undefined : size,
        modifiedTime: isDirectory ? undefined : modifiedTime,
      };
    })
  );

  return result;
};

module.exports = localreaddir;
