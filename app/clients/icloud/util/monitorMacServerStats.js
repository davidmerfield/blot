const config = require("config");
const email = require("helper/email");
const clfdate = require("helper/clfdate");
const prettySize = require("helper/prettySize");
const { execFile } = require("child_process");

const MAC_SERVER_ADDRESS = config.icloud.server_address;
const Authorization = config.icloud.secret;
const macServerUrl = new URL(MAC_SERVER_ADDRESS);
const macServerHostname = macServerUrl.hostname;
const macServerPort =
  macServerUrl.port ||
  (macServerUrl.protocol === "https:" ? "443" : "80");

const DISK_SPACE_WARNING_THRESHOLD = config.icloud.diskSpaceWarning;
const DISK_SPACE_LIMIT = config.icloud.diskSpaceLimit;

const ICLOUD_SPACE_WARNING_THRESHOLD = config.icloud.iCloudSpaceWarning;
const ICLOUD_SPACE_LIMIT = config.icloud.iCloudSpaceLimit;

const POLLING_INTERVAL = 60 * 1000; // 1 minute
const COMMAND_TIMEOUT_MS = 5000;

const fetch = require("./rateLimitedFetchWithRetriesAndTimeout");

// map to keep track of which notifications have been sent
const notificationsSent = {};

const runCommand = (command, args, { timeout = COMMAND_TIMEOUT_MS } = {}) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout, encoding: "utf8", windowsHide: true },
      (error, stdout = "", stderr = "") => {
        resolve({
          stdout,
          stderr,
          exitCode:
            typeof error?.code === "number" ? error.code : error ? 1 : 0,
        });
      }
    );
  });

const logCommandResult = (label, command, args, result) => {
  console.log(clfdate(), label, `${command} ${args.join(" ")}`, {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  });
};

const runDiagnostics = async (label) => {
  const netcatResult = await runCommand("nc", [
    "-vz",
    macServerHostname,
    macServerPort,
  ]);
  logCommandResult(
    label,
    "nc",
    ["-vz", macServerHostname, macServerPort],
    netcatResult
  );

  const routeResult = await runCommand("ip", ["route", "get", macServerHostname]);
  logCommandResult(
    label,
    "ip",
    ["route", "get", macServerHostname],
    routeResult
  );
};

module.exports = () => {
  setInterval(async () => {
    console.log(clfdate(), "Checking Mac server stats");
    try {
      await runDiagnostics("Mac server pre-check");
      try {
        // fetching stats
        const res = await fetch(MAC_SERVER_ADDRESS + "/stats", {
          headers: { Authorization },
        });

<<<<<<< HEAD
      const stats = await res.json();

      if (
        !stats ||
        !stats.disk_bytes_available ||
        !stats.icloud_bytes_available
      ) {
        throw new Error("No stats returned");
      }

      stats.disk_available_human = prettySize(
        stats.disk_bytes_available / 1000
      );
      stats.icloud_available_human = prettySize(
        stats.icloud_bytes_available / 1000
      );

      console.log(clfdate(), "Mac server stats: ", stats);

      if (stats.disk_bytes_available < DISK_SPACE_LIMIT) {
        console.log(clfdate(), "Disk space is low");
        if (!notificationsSent.disk_space_low) {
          email.ICLOUD_DISK_LIMIT(null, stats);
          notificationsSent.disk_space_low = true;
=======
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`);
>>>>>>> master
        }

        const stats = await res.json();

        if (
          !stats ||
          !stats.disk_bytes_available ||
          !stats.icloud_bytes_available
        ) {
          throw new Error("No stats returned");
        }

        stats.disk_available_human = prettySize(
          stats.disk_bytes_available / 1000
        );
        stats.icloud_available_human = prettySize(
          stats.icloud_bytes_available / 1000
        );

        console.log(clfdate(), "Mac server stats: ", stats);

        if (notificationsSent.icloud_server_down) {
          if (!notificationsSent.icloud_server_recovered) {
            email.ICLOUD_SERVER_RECOVERED();
            notificationsSent.icloud_server_recovered = true;
          }
          notificationsSent.icloud_server_down = false;
        }

        if (stats.disk_bytes_available < DISK_SPACE_LIMIT) {
          console.log(clfdate(), "Disk space is low");
          if (!notificationsSent.disk_space_low) {
            email.ICLOUD_DISK_LIMIT(null, stats);
            notificationsSent.disk_space_low = true;
          }
        } else if (stats.disk_bytes_available < DISK_SPACE_WARNING_THRESHOLD) {
          console.log(clfdate(), "Disk space is running out");
          if (!notificationsSent.disk_space_warning) {
            email.ICLOUD_APPROACHING_DISK_LIMIT(null, stats);
            notificationsSent.disk_space_warning = true;
          }
        }

        if (stats.icloud_bytes_available < ICLOUD_SPACE_LIMIT) {
          console.log(clfdate(), "iCloud drive space is low");
          if (!notificationsSent.icloud_space_low) {
            email.ICLOUD_QUOTA_LIMIT(null, stats);
            notificationsSent.icloud_space_low = true;
          }
        } else if (
          stats.icloud_bytes_available < ICLOUD_SPACE_WARNING_THRESHOLD
        ) {
          console.log(clfdate(), "iCloud drive space is running out");
          if (!notificationsSent.icloud_space_warning) {
            email.ICLOUD_APPROACHING_QUOTA_LIMIT(null, stats);
            notificationsSent.icloud_space_warning = true;
          }
        }
      } finally {
        await runDiagnostics("Mac server post-check");
      }
    } catch (error) {
      console.log(clfdate(), "Error connecting to mac server: ", error);
      if (!notificationsSent.icloud_server_down) {
        email.ICLOUD_SERVER_DOWN();
        notificationsSent.icloud_server_down = true;
      }
      notificationsSent.icloud_server_recovered = false;
    }
  }, POLLING_INTERVAL); 
};
