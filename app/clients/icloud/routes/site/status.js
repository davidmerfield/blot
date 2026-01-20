const database = require("../../database");
const initialTransfer = require("../../sync/initialTransfer");
const syncFromiCloud = require("../../sync/fromiCloud");
const establishSyncLock = require("sync/establishSyncLock");

module.exports = async function (req, res) {

  const blogID = req.header("blogID");
  const status = req.body;

  if (!blogID || !status) {
    return res.status(400).send("Missing blogID or status");
  }

  try {
    // store the status in the database
    await database.store(blogID, status);

  } catch (err) {
    console.error("Failed to store status in database", err);
    return res.status(500).send("Internal Server Error");
  }

  if (status.requestedResync) {
    try {
      // This will throw if the sync lock is already established
      const { done, folder } = await establishSyncLock(blogID);

      // Now that we have the sync lock, we can send "ok" to the
      // macserver since the resync can take a while
      res.send("ok");

      try {
        folder.status("Resync requested");
        console.log("Resync requested from iCloud", { blogID });

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
      console.error("Error in requestResync", err);
      return res.status(500).send("Internal Server Error");
    }
  } else if (status.acceptedSharingLink) {
    try {
      // we send "ok" immediately to the macserver
      // because the initial transfer can take a while
      res.send("ok");

      await initialTransfer(blogID);
    } catch (err) {
      console.error("Error in initialTransfer", err);
      return res.status(500).send("Internal Server Error");
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
      console.error("Error in syncFromiCloud", err);
      return res.status(500).send("Internal Server Error");
    }
  }
};
