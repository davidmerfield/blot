const Blog = require("models/blog");
const database = require("./database");
const fetch = require("./util/rateLimitedFetchWithRetriesAndTimeout");
const config = require("config");

const MACSERVER_URL = config.icloud.server_address; // The Macserver base URL from config
const MACSERVER_AUTH = config.icloud.secret; // The Macserver Authorization secret from config

module.exports = async (blogID, callback) => {
  try {
    await database.delete(blogID);

    await fetch(`${MACSERVER_URL}/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: MACSERVER_AUTH,
        blogID: blogID,
      },
    });
  } catch (error) {
    console.error(
      `Error during Macserver /disconnect request: ${error.message}`
    );
  }

  Blog.set(blogID, { client: "" }, async function (err) {
    callback();
  });
};
