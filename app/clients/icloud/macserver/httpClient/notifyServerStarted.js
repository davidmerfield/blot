const { remoteServer, Authorization } = require("../config");
const fetch = require("./rateLimitedFetchWithRetriesAndTimeout");

module.exports = async (...args) => {
  if (args.length !== 0) {
    throw new Error("Invalid number of arguments: expected 0");
  }
  
  console.log(`Notifying server that the client has started`);

  await fetch(remoteServer + "/started", {
    headers: {
      Authorization, // Use the Authorization header
    },
  });

  console.log(`Server notified that the client has started`);
};
