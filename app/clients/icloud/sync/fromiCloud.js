const fs = require("fs-extra");
const { join } = require("path");
const localPath = require("helper/localPath");
const clfdate = require("helper/clfdate");
const download = require("./util/download");
const CheckWeCanContinue = require("./util/checkWeCanContinue");
const localReaddir = require("./util/localReaddir");
const remoteReaddir = require("./util/remoteReaddir");
const remoteRecursiveList = require("./util/remoteRecursiveList");
const shouldIgnoreFile = require("clients/util/shouldIgnoreFile");

const config = require("config");
const maxFileSize = config.icloud.maxFileSize; // Maximum file size for iCloud uploads in bytes

module.exports = async (blogID, publish, update) => {
  if (!publish)
    publish = (...args) => {
      console.log(clfdate() + " iCloud:", args.join(" "));
    };

  if (!update) update = () => {};

  const checkWeCanContinue = CheckWeCanContinue(blogID);
  const summary = {
    downloaded: 0,
    removed: 0,
    createdDirs: 0,
    skipped: 0,
  };

  try {
    publish("Syncing folder tree");
    await remoteRecursiveList(blogID, "/");
  } catch (error) {
    console.error("Failed to sync folder tree", error);
    publish("Failed to sync folder tree", error.message);
  }

  const walk = async (dir) => {

    console.log(clfdate(), `Syncing folder: ${dir}`);
    
    const [remoteContents, localContents] = await Promise.all([
      remoteReaddir(blogID, dir),
      localReaddir(localPath(blogID, dir)),
    ]);

    for (const { name } of localContents) {
      const path = join(dir, name);

      if (shouldIgnoreFile(path)) {
        await checkWeCanContinue();
        publish("Removing local ignored item", path);
        await fs.remove(localPath(blogID, path));
        summary.removed += 1;
        await update(path);
        continue;
      }

      if (
        !remoteContents.find(
          (item) => item.name.normalize("NFC") === name.normalize("NFC")
        )
      ) {
        await checkWeCanContinue();
        publish("Removing local item", join(dir, name));
        await fs.remove(localPath(blogID, path));
        summary.removed += 1;
        await update(path);
      }
    }

    for (const { name, size, isDirectory } of remoteContents) {
      const path = join(dir, name);
      const existsLocally = localContents.find(
        (item) => item.name.normalize("NFC") === name.normalize("NFC")
      );

      if (isDirectory) {
        if (existsLocally && !existsLocally.isDirectory) {
          await checkWeCanContinue();
          publish("Removing", path);
          await fs.remove(localPath(blogID, path));
          summary.removed += 1;
          publish("Creating directory", path);
          await fs.ensureDir(localPath(blogID, path));
          summary.createdDirs += 1;
          await update(path);
        } else if (!existsLocally) {
          await checkWeCanContinue();
          publish("Creating directory", path);
          await fs.ensureDir(localPath(blogID, path));
          summary.createdDirs += 1;
          await update(path);
        }

        await walk(path);
      } else {
        // We could compare modified time but this seems to bug out on some sites
        const identicalOnRemote = existsLocally && existsLocally.size === size;

        if (!existsLocally || (existsLocally && !identicalOnRemote)) {
          try {
            if (size > maxFileSize) {
              publish("File too large", path);
              summary.skipped += 1;
              continue;
            }

            await checkWeCanContinue();
            publish("Updating", path);

            await download(blogID, path);
            summary.downloaded += 1;
            await update(path);
          } catch (e) {
            publish("Failed to download", path, e);
          }
        }
      }
    }
  };

  try {
    await walk("/");
  } catch (err) {
    publish("Sync failed", err.message);
    // Possibly rethrow or handle
  }

  return summary;
};
