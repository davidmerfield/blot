const monitorMacServerStats = require("./util/monitorMacServerStats");
const resync = require("./util/resyncRecentlySynced");
const initialTransfer = require("./sync/initialTransfer");
const database = require("./database");

module.exports = async () => {

  await database.iterate(async (blogID, account) => {
    if (account.transferringToiCloud) {
      console.log("Resuming initial transfer for", blogID);
      await initialTransfer(blogID);
    }
  });

  resync();

  monitorMacServerStats();
};
