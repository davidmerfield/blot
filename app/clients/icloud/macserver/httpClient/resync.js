const { remoteServer, Authorization } = require("../config");
const fetch = require("./rateLimitedFetchWithRetriesAndTimeout");
const clfdate = require("../util/clfdate");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RESYNC_MAX_ATTEMPTS = 20;
const RESYNC_BASE_DELAY_MS = 1000;
const RESYNC_MAX_DELAY_MS = 5 * 60 * 1000;

const requestResyncOnce = async (blogID) => {
  if (!blogID || typeof blogID !== "string") {
    console.error(clfdate(), "Invalid blogID for resync request", { blogID });
    throw new Error("Invalid blogID");
  }

  console.log(clfdate(), `Requesting resync for blogID: ${blogID}`);

  try {
    const response = await fetch(`${remoteServer}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization,
        blogID,
      },
      body: JSON.stringify({ resyncRequested: true }),
    });

    if (response && response.ok === false) {
      throw new Error(`Resync request failed with status ${response.status}`);
    }
  } catch (error) {
    console.error(
      clfdate(),
      `Failed to request resync for blogID ${blogID}`,
      error
    );
    throw error;
  }

  console.log(clfdate(), `Resync requested for blogID: ${blogID}`);
};

module.exports = async (blogID, reason) => {
  console.log(
    clfdate(),
    `Requesting resync for blogID: ${blogID}`,
    reason ? `(${reason})` : ""
  );

  for (let attempt = 1; attempt <= RESYNC_MAX_ATTEMPTS; attempt += 1) {
    try {
      await requestResyncOnce(blogID);
      console.log(
        clfdate(),
        `Resync acknowledged for blogID: ${blogID} after ${attempt} attempt(s)`
      );
      return;
    } catch (error) {
      const delayMs = Math.min(
        RESYNC_BASE_DELAY_MS * 2 ** (attempt - 1),
        RESYNC_MAX_DELAY_MS
      );
      if (attempt === RESYNC_MAX_ATTEMPTS) {
        console.error(
          clfdate(),
          `Resync request failed after ${RESYNC_MAX_ATTEMPTS} attempts for blogID: ${blogID}`,
          error
        );
        return;
      }
      console.warn(
        clfdate(),
        `Resync request failed on attempt ${attempt}/${RESYNC_MAX_ATTEMPTS} for blogID: ${blogID}, retrying in ${delayMs}ms`,
        error
      );
      await sleep(delayMs);
    }
  }
};
