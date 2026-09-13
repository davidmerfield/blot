const scheduler = require("node-schedule");
const { promisify } = require("util");
const Blog = require("models/blog");
const clfdate = require("helper/clfdate");
const debug = require("debug")("blot:clients:dropbox:init");
const email = require("helper/email");
const resetToBlot = require("./sync/reset-to-blot");
const { get: getAccount } = require("./database");
const Fix = require("sync/fix");

const getAllIDs = promisify(Blog.getAllIDs);
const getBlog = promisify(Blog.get);
const getDropboxAccount = promisify(getAccount);

const ONE_HOUR_IN_MS = 60 * 60 * 1000;
const FIFTEEN_MINUTES_IN_MS = 15 * 60 * 1000;

const countChanges = (summary = {}) => {
  return (
    (summary.downloaded || 0) +
    (summary.removed || 0) +
    (summary.createdDirs || 0)
  );
};

const hasRecentSync = (account) => {
  if (!account || typeof account.last_sync !== "number") return false;
  return Date.now() - account.last_sync <= ONE_HOUR_IN_MS;
};

const runValidation = async () => {
  debug(clfdate(), "Dropbox: Running hourly sync validation");

  let blogIDs = [];

  try {
    blogIDs = await getAllIDs();
  } catch (err) {
    console.error(clfdate(), "Dropbox: Failed to load blog IDs", err);
    return;
  }

  const blogsWithChanges = [];
  let checkedBlogs = 0;

  for (const blogID of blogIDs) {
    try {
      const blog = await getBlog({ id: blogID });
      if (!blog || blog.client !== "dropbox") continue;

      const account = await getDropboxAccount(blogID);
      if (!hasRecentSync(account)) continue;

      checkedBlogs += 1;

      const publish = () => {};

      const summary = await resetToBlot(blogID, publish);
      const changeCount = countChanges(summary);

      if (changeCount > 0) {
        blogsWithChanges.push({
          id: blogID,
          handle: blog.handle,
          truncatedId: blogID.slice(0, 12),
          changeCount,
          changeCountPlural: changeCount !== 1,
        });
      }

      await new Promise((resolve) => {
        Fix(blog, (fixError) => {
          if (fixError) {
            console.error(
              clfdate(),
              "Dropbox: Fix error for blog",
              blogID,
              fixError
            );
          }
          resolve();
        });
      });
    } catch (err) {
      console.error(
        clfdate(),
        "Dropbox: Error validating sync for blog",
        blogID,
        err
      );
    }
  }

  debug(
    clfdate(),
    "Dropbox: Sync validation complete",
    `checked=${checkedBlogs}`,
    `issues=${blogsWithChanges.length}`
  );

  if (blogsWithChanges.length === 0) return;

  email.DROPBOX_SYNC_ISSUE(null, { blogs: blogsWithChanges }, function (err) {
    if (err) {
      console.error(clfdate(), "Dropbox: Failed to send issue email", err);
    } else {
      debug(clfdate(), "Dropbox: Sent sync issue report email");
    }
  });
};

const resyncRecentSyncsOnStartup = async () => {
  debug(clfdate(), "Dropbox: Checking for recent syncs on startup");

  let blogIDs = [];

  try {
    blogIDs = await getAllIDs();
  } catch (err) {
    console.error(clfdate(), "Dropbox: Failed to load blog IDs", err);
    return;
  }

  const blogsToResync = [];

  for (const blogID of blogIDs) {
    try {
      const blog = await getBlog({ id: blogID });
      if (!blog || blog.client !== "dropbox") continue;

      const account = await getDropboxAccount(blogID);
      if (!account || typeof account.last_sync !== "number") continue;

      if (Date.now() - account.last_sync >= FIFTEEN_MINUTES_IN_MS) continue;

      blogsToResync.push({ blog, blogID });
    } catch (err) {
      console.error(
        clfdate(),
        "Dropbox: Error checking recent sync for blog",
        blogID,
        err
      );
    }
  }

  if (!blogsToResync.length) return;

  setImmediate(async () => {
    for (const { blogID } of blogsToResync) {
      const publish = () => {};

      try {
        await resetToBlot(blogID, publish);
      } catch (err) {
        console.error(
          clfdate(),
          "Dropbox: Resync error for blog",
          blogID,
          err
        );
      }
    }
  });
};

module.exports = async function init() {
  debug(clfdate(), "Dropbox: Scheduling hourly sync validation");
  scheduler.scheduleJob("0 * * * *", runValidation);
  resyncRecentSyncsOnStartup().catch(function (err) {
    console.error(clfdate(), "Dropbox: Startup resync failed", err);
  });
};
