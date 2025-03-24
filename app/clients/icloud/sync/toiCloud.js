const { join } = require("path");
const localPath = require("helper/localPath");
const clfdate = require("helper/clfdate");
const CheckWeCanContinue = require("./util/checkWeCanContinue");
const remoteUpload = require("./util/remoteUpload");
const remoteMkdir = require("./util/remoteMkdir");
const remoteDelete = require("./util/remoteDelete");
const localReaddir = require("./util/localReaddir");
const remoteReaddir = require("./util/remoteReaddir");

const config = require("config");
const maxFileSize = config.icloud.maxFileSize; // Maximum file size for iCloud uploads in bytes

// fix

module.exports = async (blogID, publish, update) => {
  publish = publish || function () {};
  update = update || function () {};

  const checkWeCanContinue = CheckWeCanContinue(blogID);

  const walk = async (dir) => {
    const [remoteContents, localContents] = await Promise.all([
      remoteReaddir(blogID, dir),
      localReaddir(localPath(blogID, dir)),
    ]);

    for (const { name } of remoteContents) {
      const localItem = localContents.find(
        (item) => item.name.normalize("NFC") === name.normalize("NFC")
      );

      if (!localItem) {
        const path = join(dir, name);
        await checkWeCanContinue();
        publish("Removing from iCloud", join(dir, name));
        await remoteDelete(blogID, path);
      }
    }

    for (const { name, size, isDirectory } of localContents) {
      const path = join(dir, name);
      const remoteItem = remoteContents.find(
        (item) => item.name.normalize("NFC") === name.normalize("NFC")
      );

      if (isDirectory) {
        if (remoteItem && !remoteItem.isDirectory) {
          await checkWeCanContinue();
          publish("Removing from iCloud", path);
          await remoteDelete(blogID, path);
          publish("Creating directory in iCloud", path);
          await remoteMkdir(blogID, path);
        } else if (!remoteItem) {
          await checkWeCanContinue();
          publish("Creating directory in iCloud", path);
          await remoteMkdir(blogID, path);
        }

        await walk(path);
      } else {
        const identicalOnRemote = remoteItem && remoteItem.size === size;

        if (!remoteItem || !identicalOnRemote) {
          try {
            await checkWeCanContinue();
            if (size > maxFileSize) {
              publish("Skipping file which is too large", path);
              continue;
            }
            publish("Transferring to iCloud", path);
            await remoteUpload(blogID, path);
          } catch (e) {
            publish("Failed to upload", path, e);
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
