const RESYNC_WINDOW = 1000 * 60 * 10; // 10 minutes

const clfdate = require("helper/clfdate");

const database = require("../database");
const resync = require("../sync/fromiCloud");
const syncToiCloud = require("../sync/toiCloud");
const establishSyncLock = require("./establishSyncLock");
const Blog = require("models/blog");

const getLastSyncDateStamp = (blogID) => {
  return new Promise((resolve, reject) => {
    Blog.getStatuses(blogID, { pageSize: 1 }, (err, res) => {
      if (err) return reject(err);

      const statuses = res.statuses;

      if (!statuses || statuses.length === 0) {
        return resolve(null);
      }
      resolve(statuses[0].datestamp);
    });
  });
};

module.exports = async (options = {}) => {
  const windowMs =
    typeof options.windowMs === "number" ? options.windowMs : RESYNC_WINDOW;
  const notify = options.notify !== undefined ? options.notify : false;
  const resyncContext = notify ? "hourly validation" : "startup resync";

  console.log(
    clfdate(),
    "Resyncing recently synced blogs",
    `(${resyncContext})`
  );

  await database.iterate(async (blogID, account) => {
  
    if (!account.setupComplete) {
      console.log(
        clfdate(),
        "Account setup not complete, skipping resync: ",
        blogID
      );
      return;
    }

    const lastSync = await getLastSyncDateStamp(blogID);

    if (!lastSync) {
      console.log(clfdate(), "No last sync date found for blogID: ", blogID);
      return;
    }

    const minutesAgo = Math.floor((Date.now() - lastSync) / 1000 / 60);

    // if the blog last synced within the last 10 minutes, we want to resync
    // because we might have missed some events
    if (Date.now() - lastSync < windowMs) {
      console.log(clfdate(), "Resyncing blog: ", blogID);
      const { folder, done } = await establishSyncLock(blogID);
      try {
        await syncToiCloud(blogID, folder.status, folder.update);
        await resync(blogID, folder.status, folder.update);
        console.log(clfdate(), "Finished resyncing blog: ", blogID);
      } catch (error) {
        console.error(clfdate(), "Error resyncing blog: ", blogID, error);
      } finally {
        await done();
      }
    } else {
      console.log(
        clfdate(),
        "Skipping resync of blog which last synced",
        minutesAgo,
        "minutes ago"
      );
    }
  });

  console.log(
    clfdate(),
    "Finished resyncing recently synced blogs",
    `(${resyncContext})`
  );
};
