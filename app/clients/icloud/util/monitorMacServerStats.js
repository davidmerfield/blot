const config = require("config");
const email = require("helper/email");
const clfdate = require("helper/clfdate");
const prettySize = require("helper/prettySize");

const MAC_SERVER_ADDRESS = config.icloud.server_address;
const Authorization = config.icloud.secret;

const DISK_SPACE_WARNING_THRESHOLD = config.icloud.diskSpaceWarning;
const DISK_SPACE_LIMIT = config.icloud.diskSpaceLimit;

const ICLOUD_SPACE_WARNING_THRESHOLD = config.icloud.iCloudSpaceWarning;
const ICLOUD_SPACE_LIMIT = config.icloud.iCloudSpaceLimit;
const fetch = require("node-fetch");

const POLLING_INTERVAL = 60 * 1000; // 1 minute

// map to keep track of which notifications have been sent
const notificationsSent = {};

module.exports = () => {
  setInterval(async () => {
    console.log(clfdate(), "Checking Mac server stats");
    try {
      // fetching stats
      const res = await fetch(MAC_SERVER_ADDRESS + "/stats", {
        headers: { Authorization },
      });

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
    } catch (error) {
      console.log(clfdate(), "Error connecting to mac server: ", error);
      if (!notificationsSent.icloud_server_down) {
        email.ICLOUD_SERVER_DOWN();
        notificationsSent.icloud_server_down = true;
      }
    }
  }, POLLING_INTERVAL); 
};
