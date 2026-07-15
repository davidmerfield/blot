const clfdate = require("helper/clfdate");
const database = require("../database");
const disconnect = require("../disconnect");
const express = require("express");
const fetch = require("../util/rateLimitedFetchWithRetriesAndTimeout");
const dashboard = new express.Router();
const parseBody = require("body-parser").urlencoded({ extended: false });
const config = require("config"); // For accessing configuration values
const establishSyncLock = require("sync/establishSyncLock");
const { handleSyncLockError } = require("./lock");
const Blog = require("models/blog");

const VIEWS = require("path").resolve(__dirname + "/../views") + "/";

const MACSERVER_URL = config.icloud.server_address; // The Macserver base URL from config
const MACSERVER_AUTH = config.icloud.secret; // The Macserver Authorization secret from config

dashboard.use(async function (req, res, next) {
  try {
    res.locals.account = await database.get(req.blog.id);
    next();
  } catch (error) {
    next(error);
  }
});

dashboard.get("/", function (req, res) {
  if (!res.locals.account) {
    return res.redirect(req.baseUrl + "/connect");
  }

  res.locals.blotiCloudAccount = config.icloud.email;
  res.render(VIEWS + "index");
});

dashboard.route("/connect").get(function (req, res) {
  res.render(VIEWS + "connect");
});

dashboard.route("/setup").get(function (req, res) {
  res.locals.blotiCloudAccount = config.icloud.email;
  res.render(VIEWS + "setup");
});

dashboard
  .route("/disconnect")
  .get(function (req, res) {
    res.render(VIEWS + "disconnect");
  })
  .post(function (req, res, next) {
    disconnect(req.blog.id, function (err, warning) {
      if (err) return next(err);

      if (warning) {
        return res.message(
          req.baseUrl,
          "Disconnected from iCloud. Remote cleanup will retry in the background."
        );
      }

      res.message(req.baseUrl, "Disconnected from iCloud");
    });
  });

dashboard
  .route("/set-up-folder")
  .post(parseBody, async function (req, res, next) {
    try {
      if (req.body.cancel) {
        if (!req.blog.client) {
          return res.redirect(res.locals.dashboardBase + "/client");
        }

        return disconnect(req.blog.id, next);
      }

      const setClientError = await new Promise((resolve) => {
        Blog.set(req.blog.id, { client: "icloud" }, function (err) {
          resolve(err);
        });
      });

      if (setClientError) {
        return next(setClientError);
      }

      const blogID = req.blog.id;
      const sharingLink = req.body.sharingLink;
      const blotiCloudAccount = req.body.blotiCloudAccount;

      // Store the sharingLink in the database if provided
      if (sharingLink) {
        // validate the sharing link format
        // it should look like: https://www.icloud.com/iclouddrive/08d83wAt2lMHc46hEEi0D5zcQ#example
        if (
          !/^https:\/\/www\.icloud\.com\/iclouddrive\/[a-zA-Z0-9_-]+#/.test(
            sharingLink
          )
        ) {
          return next(new Error("Invalid sharing link format"));
        }

        await database.store(blogID, { sharingLink, blotiCloudAccount });
      } else {
        return next(new Error("Paste the sharing link into the box"));
      }

      const { folder, done } = await establishSyncLock(blogID);
      folder.status("Waiting for folder setup to complete...");
      await done();

      // Make the request to the Macserver /setup endpoint
      console.log(`Sending setup request to Macserver for blogID: ${blogID}`);
      try {
        await fetch(`${MACSERVER_URL}/setup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: MACSERVER_AUTH, // Use the Macserver Authorization header
            blogID: blogID,
            sharingLink: sharingLink || "", // Include the sharingLink header, even if empty
          },
        });
      } catch (error) {
        console.error(
          `Macserver /setup request failed for blogID: ${blogID}`,
          error
        );
        // Clean up the database entry if setup failed
        try {
          await database.delete(blogID);
        } catch (dbError) {
          console.error(
            `Error cleaning up database after setup failure: ${dbError.message}`
          );
        }
        return next(
          new Error(
            `Failed to set up folder: ${error.message || "Unknown error"}`
          )
        );
      }

      console.log(`Macserver /setup request succeeded for blogID: ${blogID}`);

      // Redirect back to the dashboard
      res.redirect(req.baseUrl);
    } catch (error) {
      if (
        handleSyncLockError({
          err: error,
          res,
          blogID: req.blog.id,
          action: "setup folder",
        })
      ) {
        return;
      }

      console.error("Error in /set-up-folder:", error);
      next(error); // Pass the error to the error handler
    }
  });

dashboard.post("/cancel", async function (req, res, next) {
  try {
    await database.delete(req.blog.id);

    res.message(req.baseUrl, "Cancelled the creation of your new folder");
  } catch (error) {
    next(error);
  }
});

module.exports = dashboard;
