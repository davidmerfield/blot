const fs = require("fs-extra");
const { join } = require("path");
const localPath = require("helper/localPath");
const clfdate = require("helper/clfdate");
const download = require("./util/download");
const CheckWeCanContinue = require("./util/checkWeCanContinue");
const localReaddir = require("./util/localReaddir");
const remoteReaddir = require("./util/remoteReaddir");

const config = require("config");
const maxFileSize = config.icloud.maxFileSize; // Maximum file size for iCloud uploads in bytes

module.exports = async (blogID, publish, update) => {
  if (!publish)
    publish = (...args) => {
      console.log(clfdate() + " iCloud:", args.join(" "));
    };

  if (!update) update = () => {};

  const checkWeCanContinue = CheckWeCanContinue(blogID);

  const walk = async (dir) => {
    publish("Checking", dir);

    const [remoteContents, localContents] = await Promise.all([
      remoteReaddir(blogID, dir),
      localReaddir(localPath(blogID, dir)),
    ]);

    for (const { name } of localContents) {
      if (
        !remoteContents.find(
          (item) => item.name.normalize("NFC") === name.normalize("NFC")
        )
      ) {
        const path = join(dir, name);
        await checkWeCanContinue();
        publish("Removing local item", join(dir, name));
        await fs.remove(localPath(blogID, path));
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
          publish("Creating directory", path);
          await fs.ensureDir(localPath(blogID, path));
          await update(path);
        } else if (!existsLocally) {
          await checkWeCanContinue();
          publish("Creating directory", path);
          await fs.ensureDir(localPath(blogID, path));
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
              continue;
            }

            await checkWeCanContinue();
            publish("Updating", path);

            await download(blogID, path);
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
};
