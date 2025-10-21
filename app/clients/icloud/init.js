const monitorMacServerStats = require("./util/monitorMacServerStats");
const resync = require("./util/resyncRecentlySynced");
const initialTransfer = require("./sync/initialTransfer");
const database = require("./database");

module.exports = async () => {

  await database.iterate(async (blogID, account) => {
    if (!account.transferringToiCloud) {
      return;
    }

    try {
      console.log("Resuming initial transfer for", blogID);
      await initialTransfer(blogID);
    } catch (error) {
      console.error("Error resuming initial transfer for", blogID, error);
    }
  });

  resync();

  monitorMacServerStats();
};
