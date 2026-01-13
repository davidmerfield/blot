const { remoteServer, Authorization } = require("../config");
const fetch = require("./rateLimitedFetchWithRetriesAndTimeout");
const clfdate = require("../util/clfdate");

module.exports = async (...args) => {
  const [blogID, path] = args;

  if (!blogID || typeof blogID !== "string") {
    console.error(clfdate(), "Invalid blogID for mkdir client request", {
      blogID,
    });
    throw new Error("Invalid blogID");
  }

  if (!path || typeof path !== "string") {
    console.error(clfdate(), "Invalid path for mkdir client request", {
      path,
      blogID,
    });
    throw new Error("Invalid path");
  }

  if (args.length !== 2) {
    console.error(clfdate(), "Invalid argument count for mkdir client request", {
      argsLength: args.length,
    });
    throw new Error("Invalid number of arguments: expected 2");
  }

  console.log(clfdate(), `Issuing external mkdir for blogID: ${blogID}, path: ${path}`);

  const pathBase64 = Buffer.from(path).toString("base64");
  
  try {
    await fetch(`${remoteServer}/mkdir`, {
      method: "POST",
      headers: {
        Authorization, // Use the Authorization header
        blogID,
        pathBase64,
      },
    });
  } catch (error) {
    console.error(
      clfdate(),
      `Failed to issue external mkdir for blogID ${blogID}, path ${path}`,
      error
    );
    throw error;
  }

  console.log(clfdate(), `Issuing external mkdir successful`);
};
