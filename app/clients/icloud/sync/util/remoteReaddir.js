const config = require("config");
const MAC_SERVER_ADDRESS = config.icloud.server_address;
const MACSERVER_AUTH = config.icloud.secret; // The Macserver Authorization secret from config
const fetch = require("node-fetch");

module.exports = async (blogID, path) => {
  const pathBase64 = Buffer.from(path).toString("base64");

  const res = await fetch(MAC_SERVER_ADDRESS + "/readdir", {
    headers: { Authorization: MACSERVER_AUTH, blogID, pathBase64 },
  });

  if (!res.ok) {
    let errorMessage = `Failed to read remote directory (${res.status} ${res.statusText})`;

    try {
      const errorResponse = await res.json();
      errorMessage = errorResponse.error || errorResponse.message || errorMessage;
    } catch (_) {
      try {
        const errorText = await res.text();
        if (errorText) errorMessage = `${errorMessage}: ${errorText}`;
      } catch (__) {
        // Ignore secondary errors while building the message
      }
    }

    const error = new Error(errorMessage);
    error.status = res.status;
    throw error;
  }

  const json = await res.json();
  return json;
};
