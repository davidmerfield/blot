const Blog = require("models/blog");
const database = require("./database");
const fetch = require("./util/rateLimitedFetchWithRetriesAndTimeout");
const config = require("config");

const MACSERVER_URL = config.icloud.server_address; // The Macserver base URL from config
const MACSERVER_AUTH = config.icloud.secret; // The Macserver Authorization secret from config

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
  } catch (error) {
    console.error(
      `Error during Macserver /disconnect request: ${error.message}`
    );
    // If the server request fails, we still want to clean up local state
    // to prevent the blog from being stuck in a connected state
    try {
      await database.delete(blogID);
    } catch (dbError) {
      console.error(
        `Error deleting from database after disconnect failure: ${dbError.message}`
      );
    }
  }

  Blog.set(blogID, { client: "" }, async function (err) {
    callback();
  });
};
