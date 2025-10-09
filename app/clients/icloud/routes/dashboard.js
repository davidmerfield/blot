const clfdate = require("helper/clfdate");
const database = require("../database");
const disconnect = require("../disconnect");
const express = require("express");
const fetch = require("node-fetch"); // For making HTTP requests
const dashboard = new express.Router();
const parseBody = require("body-parser").urlencoded({ extended: false });
const config = require("config"); // For accessing configuration values
const establishSyncLock = require("../util/establishSyncLock");

const VIEWS = require("path").resolve(__dirname + "/../views") + "/";

const MACSERVER_URL = config.icloud.server_address; // The Macserver base URL from config
const MACSERVER_AUTH = config.icloud.secret; // The Macserver Authorization secret from config

dashboard.use(async function (req, res, next) {
  res.locals.account = await database.get(req.blog.id);
  next();
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
    disconnect(req.blog.id, next);
  });

dashboard
  .route("/set-up-folder")
  .post(parseBody, async function (req, res, next) {
    try {
      if (req.body.cancel) {
        return disconnect(req.blog.id, next);
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
        // this allows us to reset the client
        await database.delete(blogID);
        return res.redirect(req.baseUrl);
      }

      // Make the request to the Macserver /setup endpoint
      console.log(`Sending setup request to Macserver for blogID: ${blogID}`);
      const response = await fetch(`${MACSERVER_URL}/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: MACSERVER_AUTH, // Use the Macserver Authorization header
          blogID: blogID,
          sharingLink: sharingLink || "", // Include the sharingLink header, even if empty
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Macserver /setup request failed: ${response.status} - ${errorText}`
        );
        return next(new Error(`Failed to set up folder: ${errorText}`));
      }

      console.log(`Macserver /setup request succeeded for blogID: ${blogID}`);
      const { folder, done } = await establishSyncLock(blogID);
      folder.status("Waiting for folder setup to complete...");
      await done();

      // Redirect back to the dashboard
      res.redirect(req.baseUrl);
    } catch (error) {
      console.error("Error in /set-up-folder:", error);
      next(error); // Pass the error to the error handler
    }
  });

dashboard.post("/cancel", async function (req, res) {
  await database.blog.delete(req.blog.id);

  res.message(req.baseUrl, "Cancelled the creation of your new folder");
});

module.exports = dashboard;
