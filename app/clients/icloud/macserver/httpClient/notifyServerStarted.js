import { remoteServer, Authorization } from "../config.js";
import fetch from "./rateLimitedFetchWithRetriesAndTimeout.js";
import clfdate from "../util/clfdate.js";

export default async (...args) => {
  if (args.length !== 0) {
    console.error(clfdate(), "Invalid argument count for notifyServerStarted", {
      argsLength: args.length,
    });
    throw new Error("Invalid number of arguments: expected 0");
  }
  
  try {
    await fetch(remoteServer + "/started", {
      headers: {
        Authorization, // Use the Authorization header
      },
    });
  } catch (error) {
    console.error(
      clfdate(),
      "Failed to notify server that the client has started",
      error
    );
    throw error;
  }

};
