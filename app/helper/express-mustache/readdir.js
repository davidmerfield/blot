module.exports = async function recursiveReaddir(dir, allFiles = []) {
  const files = (await fs.readdir(dir)).map((f) => join(dir, f));
  allFiles.push(...files);
  await Promise.all(
    files.map(
      async (f) =>
        (await fs.stat(f)).isDirectory() && recursiveReaddir(f, allFiles)
    )
  );
  return allFiles;
};
