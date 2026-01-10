const { remoteServer, Authorization } = require("../config");
const fetch = require("./rateLimitedFetchWithRetriesAndTimeout");
const clfdate = require("helper/clfdate");

module.exports = async (...args) => {
  const [blogID, path] = args;

  if (!blogID || typeof blogID !== "string") {
    throw new Error("Invalid blogID");
  }

  if (!path || typeof path !== "string") {
    throw new Error("Invalid path");
  }

  if (args.length !== 2) {
    throw new Error("Invalid number of arguments: expected 2");
  }

  console.log(clfdate(), `Issuing external mkdir for blogID: ${blogID}, path: ${path}`);

  const pathBase64 = Buffer.from(path).toString("base64");
  
  await fetch(`${remoteServer}/mkdir`, {
    method: "POST",
    headers: {
      Authorization, // Use the Authorization header
      blogID,
      pathBase64,
    },
  });

  console.log(clfdate(), `Issuing external mkdir successful`);
};
