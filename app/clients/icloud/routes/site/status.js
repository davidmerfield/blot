const database = require("../../database");
const initialTransfer = require("../../sync/initialTransfer");
const syncFromiCloud = require("../../sync/fromiCloud");
const establishSyncLock = require("sync/establishSyncLock");

const requestResync = async (blogID) => {
  const { done, folder } = await establishSyncLock(blogID);

  try {
    folder.status("Resync requested");
    console.log("Resync requested from iCloud", { blogID });
    await syncFromiCloud(blogID, folder.status.bind(folder), folder.update);
    folder.status("Resync complete");
  } finally {
    await done();
  }
};

module.exports = async function (req, res) {
  const blogID = req.header("blogID");
  const status = req.body;

  res.send("ok");

  try {
    // store the status in the database
    await database.store(blogID, status);

    // run when the macserver has successfully recieved the sharing link
    // and created the folder
    if (status.acceptedSharingLink) {
      console.log("Initial transfer started");
      await initialTransfer(blogID);
    } else if (status.resyncRequested) {
      await requestResync(blogID);
    } else {
      const { done, folder } = await establishSyncLock(blogID);

      try {
        folder.status("Sync update from iCloud");
        console.log("Sync update from iCloud", status);
        folder.status("Sync complete");
      } finally {
        done();
      }
    }
  } catch (err) {
    console.log("Error in /status", err);
  }
};
