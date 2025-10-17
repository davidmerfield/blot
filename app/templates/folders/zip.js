const fs = require("fs-extra");
const archiver = require("archiver");
const { createHash } = require("crypto");
const { join, relative } = require("path");

const config = require("config");
const clfdate = require("helper/clfdate");
const recursiveReadDir = require("../../helper/recursiveReadDirSync");

const VIEW_DIRECTORY = join(config.views_directory, "folders");
const FOLDER_DIRECTORY = __dirname;

const tmp = require("helper/tempDir")();
const CACHE_DIRECTORY = join(tmp, "folder-zips");

const cache = new Map();

function computeFolderHash(folderPath) {
  const files = recursiveReadDir(folderPath).sort();
  const hash = createHash("sha256");

  hash.update(relative(FOLDER_DIRECTORY, folderPath));

  files.forEach((filePath) => {
    const relativePath = relative(folderPath, filePath);
    hash.update("file:\0");
    hash.update(relativePath);
    hash.update("\0");

    const stats = fs.statSync(filePath);
    hash.update(String(stats.mode));
    hash.update("\0");
    hash.update(String(stats.size));
    hash.update("\0");

    const contents = fs.readFileSync(filePath);
    hash.update(contents);
    hash.update("\0");
  });

  return hash.digest("hex");
}

function cacheFileName(folder, hash) {
  return `${folder}.${hash}.zip`;
}

function cacheFilePath(folder, hash) {
  return join(CACHE_DIRECTORY, cacheFileName(folder, hash));
}

async function pruneStaleCaches(folder, keepFile) {
  const entries = await fs.readdir(CACHE_DIRECTORY);
  const expected = cacheFileName(folder, keepFile.hash);

  await Promise.all(
    entries
      .filter((entry) => entry.startsWith(`${folder}.`) && entry.endsWith(".zip"))
      .filter((entry) => entry !== expected)
      .map((entry) => fs.remove(join(CACHE_DIRECTORY, entry)))
  );
}

async function copyFromCache(folder, cacheInfo, outputPath) {
  cache.set(folder, cacheInfo);
  await fs.copy(cacheInfo.path, outputPath);
}

async function archiveFolder(folder, hash, folderPath, cachePath, outputPath) {
  await fs.ensureDir(CACHE_DIRECTORY);
  await fs.ensureDir(VIEW_DIRECTORY);

  const tempPath = `${cachePath}.tmp`;
  await fs.remove(tempPath);

  const output = fs.createWriteStream(tempPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  return new Promise((resolve, reject) => {
    output.on("close", async () => {
      try {
        console.log(archive.pointer() + " total bytes for", folder);
        await fs.move(tempPath, cachePath, { overwrite: true });
        const cacheInfo = { hash, path: cachePath };
        await copyFromCache(folder, cacheInfo, outputPath);
        await pruneStaleCaches(folder, cacheInfo);
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    output.on("error", reject);

    archive.on("warning", (err) => {
      if (err.code !== "ENOENT") {
        reject(err);
      }
    });

    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(folderPath, false);
    archive.finalize();
  });
}

async function processFolder(folder) {
  const folderPath = join(FOLDER_DIRECTORY, folder);
  const hash = computeFolderHash(folderPath);
  const cachePath = cacheFilePath(folder, hash);
  const outputPath = join(VIEW_DIRECTORY, `${folder}.zip`);

  const cached = cache.get(folder);
  if (cached && cached.hash === hash && (await fs.pathExists(cached.path))) {
    console.log(clfdate(), folder, "Copying cached ZIP from memory");
    await copyFromCache(folder, cached, outputPath);
    return;
  }

  if (await fs.pathExists(cachePath)) {
    console.log(clfdate(), folder, "Copying cached ZIP from", cachePath);
    await copyFromCache(folder, { hash, path: cachePath }, outputPath);
    return;
  }

  console.log(clfdate(), folder, "Generating ZIP");
  await archiveFolder(folder, hash, folderPath, cachePath, outputPath);
}

async function main() {
  await fs.ensureDir(CACHE_DIRECTORY);
  await fs.ensureDir(VIEW_DIRECTORY);

  const folders = (await fs.readdir(FOLDER_DIRECTORY)).filter(
    (entry) => entry.indexOf(".") === -1
  );

  for (const folder of folders) {
    await processFolder(folder);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = main;
