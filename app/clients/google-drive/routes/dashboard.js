const clfdate = require("helper/clfdate");
const database = require("../database");
const disconnect = require("../disconnect");
const establishSyncLock = require("../util/establishSyncLock");
const createDriveClient = require("../serviceAccount/createDriveClient");
const requestServiceAccount = require("clients/google-drive/serviceAccount/request");
const parseBody = require("body-parser").urlencoded({ extended: false });

const express = require("express");
const dashboard = new express.Router();

const finishSetup = require("./setup");

const VIEWS = require("path").resolve(__dirname + "/../views") + "/";

dashboard.use(async function (req, res, next) {
  res.locals.account = await database.blog.get(req.blog.id);

  if (res.locals.account && res.locals.account.serviceAccountId) {
    res.locals.serviceAccount = await database.serviceAccount.get(
      res.locals.account.serviceAccountId
    );
  }

  next();
});

dashboard.get("/", function (req, res) {
  if (!res.locals.account) {
    return res.redirect(req.baseUrl + "/connect");
  }

  res.render(VIEWS + "index");
});

dashboard
  .route("/disconnect")
  .get(function (req, res) {
    res.render(VIEWS + "disconnect");
  })
  .post(function (req, res, next) {
    disconnect(req.blog.id, next);
  });

dashboard.route("/connect").get(function (req, res) {
  res.render(VIEWS + "connect");
});

dashboard.route("/setup").get(async function (req, res) {
  if (res.locals.account && res.locals.account.email) {
    res.locals.suggestedEmail = res.locals.account.email;
  } else {
    let suggestedEmail = req.user.email;

    const otherBlogIDs = req.user.blogs.filter((id) => id !== req.blog.id);
    const otherDriveAccounts = await Promise.all(
      otherBlogIDs.map((id) => database.blog.get(id))
    );

    otherDriveAccounts.forEach((account) => {
      if (account && account.email) {
        suggestedEmail = account.email;
        return;
      }
    });

    res.locals.suggestedEmail = suggestedEmail;
  }

  res.render(VIEWS + "setup");
});

dashboard
  .route("/set-up-folder")
  .post(parseBody, async function (req, res, next) {
    const existingAccount = await database.blog.get(req.blog.id);

    if (req.body.cancel) {
      if (existingAccount && existingAccount.folderId && !existingAccount.error) {
        return res.redirect(req.baseUrl);
      } else {
        return disconnect(req.blog.id, next);
      }
    }

    if (!req.body.email) {
      return res.message(req.baseUrl, "Please enter your email address");
    }

    if (existingAccount && existingAccount.email === req.body.email && !existingAccount.error) {
      return res.redirect(req.baseUrl);
    }

    if (req.body.email.length > 100) {
      return res.message(req.baseUrl, "Email address is too long");
    }

    if (req.body.email.indexOf("@") === -1) {
      return res.message(req.baseUrl, "Please enter a valid email address");
    }

    // Determine the service account ID we'll use to sync this blog.
    const serviceAccountId = await requestServiceAccount();
    const blog = req.blog;
    const email = req.body.email;

    await database.blog.store(req.blog.id, {
      email,
      serviceAccountId,
      error: null,
      preparing: true,
      startedSetup: Date.now(),
      nonEmptyFolderShared: false,
      nonEditorPermissions: false,
      folderId: null,
      folderName: null,
    });

    let drive;

    try {
      drive = await createDriveClient(serviceAccountId);
    } catch (e) {
      return res.message(
        req.baseUrl,
        "Failed to connect to Google Drive. Please try again later."
      );
    }

    let sync;

    try {
      sync = await establishSyncLock(blog.id);
    } catch (e) {
      return res.message(
        req.baseUrl,
        "Your folder is busy. Please try again later."
      );
    }

    sync.folder.status("Waiting for invite to Google Drive folder");

    console.log(clfdate(), "Google Drive Client", "Setting up folder");
    res.redirect(req.baseUrl);

    // This can happen in the background
    try {
      await finishSetup(blog, drive, email, sync);
    } catch (e) {
      console.log(clfdate(), "Google Drive Client: finishSetup", e);
    }
  });

module.exports = dashboard;
