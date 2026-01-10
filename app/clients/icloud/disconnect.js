const Blog = require("models/blog");
const database = require("./database");
const fetch = require("./util/rateLimitedFetchWithRetriesAndTimeout");
const config = require("config");

const MACSERVER_URL = config.icloud.server_address; // The Macserver base URL from config
const MACSERVER_AUTH = config.icloud.secret; // The Macserver Authorization secret from config

const removeClientFromBlog = (blogID) => new Promise((resolve, reject) => {
  Blog.set(blogID, { client: "" }, function (err) {
    if (err) return reject(err);
    resolve();
  });
});

module.exports = async (blogID, callback) => {
  try {
    // First, notify the Mac server to disconnect
    // This ensures the server is aware before we delete local state
    await fetch(`${MACSERVER_URL}/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MACSERVER_AUTH,
        blogID: blogID,
      },
    });

    // Only delete from database after successful server notification
    await database.delete(blogID);

    await removeClientFromBlog(blogID);

    callback();
  } catch (error) {
    console.error(
      `Error during Macserver /disconnect request: ${error.message}`
    );
    // If the server request fails, we need to decide whether to clean up local state.
    // To avoid inconsistent state (local DB deleted but server still thinks connected),
    // we do NOT delete from database on server notification failure.
    // The blog will remain in a connected state, allowing retry of the disconnect operation.
    // This is a fail-secure approach that maintains state consistency.
    console.warn(
      `Disconnect failed for blogID ${blogID}: server notification failed. ` +
      `Local state preserved to maintain consistency. Disconnect can be retried.`
    );

    callback(error);
  }
};
