const { remoteServer, Authorization } = require("../config");
const fetch = require("./rateLimitedFetchWithRetriesAndTimeout");
const clfdate = require("helper/clfdate");

module.exports = async (...args) => {
  if (args.length !== 0) {
    throw new Error("Invalid number of arguments: expected 0");
  }
  
  console.log(clfdate(), `Notifying server that the client has started`);

  await fetch(remoteServer + "/started", {
    headers: {
      Authorization, // Use the Authorization header
    },
  });

  console.log(clfdate(), `Server notified that the client has started`);
};
