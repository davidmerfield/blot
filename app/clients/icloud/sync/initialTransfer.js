const config = require("config");
const MACSERVER_URL = config.icloud.server_address; // The Macserver base URL from config
const MACSERVER_AUTH = config.icloud.secret; // The Macserver Authorization secret from config
const database = require("../database");
const syncToiCloud = require("./toiCloud");
const resolveCaseConflicts = require("./resolveCaseConflicts");
const establishSyncLock = require("sync/establishSyncLock");
const fetch = require("../util/rateLimitedFetchWithRetriesAndTimeout");

module.exports = async function initialTransfer(blogID) {
  // establish sync lock
  const { folder, done } = await establishSyncLock(blogID);

  try {
    folder.status("Setting up iCloud sync");
    await database.store(blogID, { transferringToiCloud: true, error: null });
    folder.status("Resolving case conflicts");
    await resolveCaseConflicts(blogID, folder.status, folder.update);
    folder.status("Syncing to iCloud");
    await syncToiCloud(blogID, folder.status, folder.update);

    // Now that the transfer is complete, notify the Macserver to begin watching the iCloud folder
    // for changes. This will let us know when the user has changed their folder on iCloud.
    await fetch(`${MACSERVER_URL}/watch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MACSERVER_AUTH,
        blogID: blogID,
      },
    });
    folder.status("Setup complete");
    await database.store(blogID, {
      setupComplete: true,
      transferringToiCloud: false,
      error: null,
    });
  } catch (error) {
    await database.store(blogID, {
      transferringToiCloud: false,
      error: error?.message || String(error),
    });
    throw error;
  } finally {
    await done();
  }
};
