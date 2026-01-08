const scheduler = require("node-schedule");
const { promisify } = require("util");
const Blog = require("models/blog");
const clfdate = require("helper/clfdate");
const email = require("helper/email");
const resetToBlot = require("./sync/reset-to-blot");
const { get: getAccount } = require("./database");

const getAllIDs = promisify(Blog.getAllIDs);
const getBlog = promisify(Blog.get);
const getDropboxAccount = promisify(getAccount);

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

const countChanges = (summary = {}) => {
  return (
    (summary.downloaded || 0) +
    (summary.removed || 0) +
    (summary.createdDirs || 0)
  );
};

const hasRecentSync = (account) => {
  if (!account || typeof account.last_sync !== "number") return false;
  return Date.now() - account.last_sync <= ONE_DAY_IN_MS;
};

const runValidation = async () => {
  console.log(clfdate(), "Dropbox: Running daily sync validation");

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

      const publish = (...args) => {
        console.log(clfdate(), "Dropbox:", blogID, ...args);
      };

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
    } catch (err) {
      console.error(
        clfdate(),
        "Dropbox: Error validating sync for blog",
        blogID,
        err
      );
    }
  }

  console.log(
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
      console.log(clfdate(), "Dropbox: Sent sync issue report email");
    }
  });
};

module.exports = async function init() {
  console.log(clfdate(), "Dropbox: Scheduling daily sync validation");
  scheduler.scheduleJob({ hour: 2, minute: 0 }, runValidation);
};
