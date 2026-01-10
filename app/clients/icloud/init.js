const scheduler = require("node-schedule");
const { promisify } = require("util");
const Blog = require("models/blog");
const clfdate = require("helper/clfdate");
const email = require("helper/email");
const monitorMacServerStats = require("./util/monitorMacServerStats");
const resync = require("./util/resyncRecentlySynced");
const initialTransfer = require("./sync/initialTransfer");
const database = require("./database");
const syncFromiCloud = require("./sync/fromiCloud");

const getBlog = promisify(Blog.get);

const ONE_HOUR_IN_MS = 60 * 60 * 1000;

const countChanges = (summary = {}) => {
  return (
    (summary.downloaded || 0) +
    (summary.removed || 0) +
    (summary.createdDirs || 0)
  );
};

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

const hasRecentSync = async (blogID) => {
  const lastSync = await getLastSyncDateStamp(blogID);
  if (!lastSync) return false;
  return Date.now() - lastSync <= ONE_HOUR_IN_MS;
};

const runValidation = async ({ notify = true } = {}) => {
  console.log(clfdate(), "iCloud: Running hourly sync validation");

  const blogsWithChanges = [];
  let checkedBlogs = 0;

  try {
    await database.iterate(async (blogID, account) => {
      try {
        const blog = await getBlog({ id: blogID });
        if (!blog || blog.client !== "icloud") return;

        if (!(await hasRecentSync(blogID))) return;

        checkedBlogs += 1;

        const publish = (...args) => {
          console.log(clfdate(), "iCloud:", blogID, ...args);
        };

        const summary = await syncFromiCloud(blogID, publish);
        const changeCount = countChanges(summary);

        if (changeCount > 0) {
          blogsWithChanges.push({
            id: blogID,
            handle: blog.handle,
            truncatedId: blogID.slice(0, 12),
            changeCount,
            changeCountPlural: changeCount !== 1,
            downloaded: summary.downloaded || 0,
            removed: summary.removed || 0,
            createdDirs: summary.createdDirs || 0
          });
        }
      } catch (error) {
        console.error(
          clfdate(),
          "iCloud: Error validating sync for blog",
          blogID,
          error
        );
      }
    });
  } catch (error) {
    console.error(clfdate(), "iCloud: Failed to iterate accounts", error);
    return;
  }

  console.log(
    clfdate(),
    "iCloud: Sync validation complete",
    `checked=${checkedBlogs}`,
    `issues=${blogsWithChanges.length}`
  );

  if (!notify || blogsWithChanges.length === 0) return;

  email.ICLOUD_SYNC_ISSUE(null, { blogs: blogsWithChanges }, function (err) {
    if (err) {
      console.error(clfdate(), "iCloud: Failed to send issue email", err);
    } else {
      console.log(clfdate(), "iCloud: Sent sync issue report email");
    }
  });
};

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

  console.log(clfdate(), "iCloud: Scheduling hourly sync validation");
  scheduler.scheduleJob("0 * * * *", () => runValidation({ notify: true }));

  resync({ notify: false });

  monitorMacServerStats();
};
