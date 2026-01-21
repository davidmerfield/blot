const database = require("../../database");
const initialTransfer = require("../../sync/initialTransfer");
const syncFromiCloud = require("../../sync/fromiCloud");
const establishSyncLock = require("sync/establishSyncLock");
const { handleSyncLockError } = require("../lock");
const email = require("helper/email");

module.exports = async function (req, res) {

  const blogID = req.header("blogID");
  const status = req.body;

  const handle = (label, err) => {
    console.error(label, err);
    if (!res.headersSent) {
      res.status(500).send("Internal Server Error");
    }
  }

  if (!blogID || !status) {
    return res.status(400).send("Missing blogID or status");
  }

  try {
    // store the status in the database
    await database.store(blogID, status);

  } catch (err) {
    return handle("Failed to store status in database", err);
  }

  if (status.resyncRequested) {
    try {
      // This will throw if the sync lock is already established
      const { done, folder } = await establishSyncLock(blogID);

      // Now that we have the sync lock, we can send "ok" to the
      // macserver since the resync can take a while
      res.send("ok");

      try {
        folder.status("Resync requested");
        console.log("Resync requested from iCloud", { blogID });
        email.ICLOUD_RESYNC_REQUESTED(null, { blogID });

        // Since we treat the iCloud folder as the source of truth,
        // there is the risk that files added to Blot's folder (e.g. preview files)
        // or template files which were edited online will be clobbered. 
        // in in future, we might be able to implement a system to merge
        // but for now we'll just sync down from iCloud.
        await syncFromiCloud(blogID, folder.status.bind(folder), folder.update);
        folder.status("Resync complete");
      } finally {
        await done();
      }
    } catch (err) {
      if (
        handleSyncLockError({
          err,
          res,
          blogID,
          action: "status resync",
        })
      ) {
        return;
      }

      return handle("Error in requestResync", err);
    }
  } else if (status.acceptedSharingLink) {
    try {
      // we send "ok" immediately to the macserver
      // because the initial transfer can take a while
      res.send("ok");

      await initialTransfer(blogID);
    } catch (err) {
      return handle("Error in initialTransfer", err);
    } 
  } else {
    try {
      const { done, folder } = await establishSyncLock(blogID);

      res.send("ok");

      try {
        folder.status("Sync update from iCloud");
        console.log("Sync update from iCloud", status);
        folder.status("Sync complete");  
      } finally {
        await done();
      }
    } catch (err) {
      if (
        handleSyncLockError({
          err,
          res,
          blogID,
          action: "status update",
        })
      ) {
        return;
      }

      return handle("Error in syncFromiCloud", err);
    }
  }
};
