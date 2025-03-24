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

const prefix = () => `${clfdate()} iCloud Sync to iCloud:`;

// Retry failed operations with exponential backoff
async function retry(fn, ...args) {
  for (let i = 0; i < 3; i++) {
    try {
      console.log("Attempt", i + 1);
      return await fn(...args);
    } catch (e) {
      if (i === 2) throw e;
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      console.log("Failed, retrying in", delay, "ms", e);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

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
        try {
          await retry(remoteDelete, blogID, path);
        } catch (e) {
          publish("Failed to remove", path);
          console.log(prefix(), "Failed to remove", path, e);
        }
      }
    }

    for (const { name, size, isDirectory } of localContents) {
      const path = join(dir, name);
      const remoteItem = remoteContents.find(
        (item) => item.name.normalize("NFC") === name.normalize("NFC")
      );

      if (isDirectory) {
        if (!remoteItem || (remoteItem && !remoteItem.isDirectory)) {
          await checkWeCanContinue();
          publish("Creating directory in iCloud", path);
          try {
            await retry(remoteMkdir, blogID, path);
          } catch (e) {
            publish("Failed to create directory", path);
            console.log(prefix(), "Failed to create directory", path, e);
            continue;
          }
        }

        await walk(path);
      } else {
        const identicalOnRemote = remoteItem && remoteItem.size === size;

        if (!remoteItem || !identicalOnRemote) {
          await checkWeCanContinue();
          if (size > maxFileSize) {
            publish("Skipping file which is too large", path);
            console.log(prefix(), "Skipping file size=" + size, path);
            continue;
          }
          publish("Transferring to iCloud", path);
          try {
            await retry(remoteUpload, blogID, path);
          } catch (e) {
            publish("Failed to upload", path, e);
          }
        }
      }
    }
  };

  try {
    await walk("/");
    publish("Sync complete");
  } catch (e) {
    publish("Sync failed");
    console.log(prefix(), "Sync failed", e);
  }
};
