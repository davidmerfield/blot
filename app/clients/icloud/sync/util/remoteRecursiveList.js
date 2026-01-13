const config = require("config");
const fetch = require("../../util/rateLimitedFetchWithRetriesAndTimeout");

const MAC_SERVER_ADDRESS = config.icloud.server_address;
const MACSERVER_AUTH = config.icloud.secret;

module.exports = async (blogID, path = "/") => {
  if (!blogID) throw new Error("blogID is required");

  const pathBase64 = Buffer.from(path).toString("base64");

  await fetch(MAC_SERVER_ADDRESS + "/recursiveList", {
    method: "POST",
    headers: {
      Authorization: MACSERVER_AUTH,
      blogID,
      pathBase64,
    },
  });

  return true;
};
