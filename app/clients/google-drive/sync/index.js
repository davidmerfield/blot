const clfdate = require("helper/clfdate");
const { promisify } = require("util");
const establishSyncLock = require("../util/establishSyncLock");
const getBlog = promisify(require("models/blog").get);
const fix = promisify(require("sync/fix"));
const sync = require("./sync");

module.exports = async function (blogID) {
  try {
    const blog = await getBlog({ id: blogID });
    const { done, folder } = await establishSyncLock(blogID);
    try {
      await sync(blogID, folder.status, folder.update);
      await fix(blog);
    } catch (err) {
      console.log(clfdate(), "Google Drive Sync:", "Sync failed", err);
    } finally {
      // It's important to always release the lock
      await done();
    }
  } catch (err) {
    console.log(clfdate(), "Google Drive Sync:", "Sync init failed", err);
  }
};
