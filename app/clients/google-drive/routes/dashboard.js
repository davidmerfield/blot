const clfdate = require("helper/clfdate");
const database = require("../database");
const disconnect = require("../disconnect");
const express = require("express");
const dashboard = new express.Router();
const establishSyncLock = require("../util/establishSyncLock");
const createDriveClient = require("../serviceAccount/createDriveClient");
const requestServiceAccount = require("clients/google-drive/serviceAccount/request");
const resetFromBlot = require("../sync/resetToDrive");
const resetFromDrive = require("../sync/resetFromDrive");
const parseBody = require("body-parser").urlencoded({ extended: false });
const fs = require("fs-extra");
const localPath = require("helper/localPath");

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
  res.render(VIEWS + "setup");
});

dashboard
  .route("/set-up-folder")
  .post(parseBody, async function (req, res, next) {
    if (req.body.cancel) {
      return disconnect(req.blog.id, next);
    }

    if (!req.body.email) {
      return res.message(req.baseUrl, "Please enter your email address");
    }

    if (req.body.email.length > 100) {
      return res.message(req.baseUrl, "Email address is too long");
    }

    if (req.body.email.indexOf("@") === -1) {
      return res.message(req.baseUrl, "Please enter a valid email address");
    }

    // Determine the service account ID we'll use to sync this blog.
    // We query the database to retrieve all the service accounts, then
    // sort them by the available space (storageQuota.available - storageQuota.used)
    // to find the one with the most available space.
    const serviceAccountId = await requestServiceAccount();

    await database.blog.store(req.blog.id, {
      email: req.body.email,
      serviceAccountId,
      error: null,
      preparing: true,
      nonEmptyFolderShared: false,
    });

    const checkWeCanContinue = async () => {
      const { preparing, email: latestEmail } = await database.blog.get(
        blog.id
      );
      // the user wants to edit their email address so we delete the existing account
      if (latestEmail !== req.body.email) throw new Error("Email changed");
      if (!preparing) throw new Error("Permission to set up revoked");
    };

    const blog = req.blog;
    const email = req.body.email;

    let done;
    let sync;

    try {
      sync = await establishSyncLock(blog.id);
    } catch (e) {
      return res.message(
        req.baseUrl,
        "Another sync is already in progress. Please try again later."
      );
    }

    // we need to hoist this so we can call it in the catch block
    done = sync.done;

    sync.folder.status("Establishing connection to Google Drive");

    let drive;

    try {
      drive = await createDriveClient(serviceAccountId);
    } catch (e) {
      if (done) done(null, () => {});
      return res.message(
        req.baseUrl,
        "Failed to connect to Google Drive. Please try again later."
      );
    }

    let folderId;
    let folderName;
    let pullFromDrive = false;

    sync.folder.status("Waiting for invite to Google Drive folder");

    // now we redirect, everything else happens in the background
    console.log(clfdate(), "Google Drive Client", "Setting up folder");
    res.redirect(req.baseUrl);

    try {
      do {
        await checkWeCanContinue();
        console.log(
          clfdate(),
          "Google Drive Client",
          "Checking for empty shared folder..."
        );
        const res = await findEmptySharedFolder(blog.id, drive, email, sync.folder.status);

        // wait 2 seconds before trying again
        if (!res) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          folderId = res.folderId;
          folderName = res.folderName;
          pullFromDrive = res.pullFromDrive;
        }
      } while (!folderId);

      await database.blog.store(blog.id, { folderId, folderName, nonEmptyFolderShared: false });

      await checkWeCanContinue();
      sync.folder.status("Ensuring new folder is in sync");

      if (pullFromDrive) {
        await resetFromDrive(blog.id, sync.folder.status);
      } else {
        await resetFromBlot(blog.id, sync.folder.status);
      }

      await database.blog.store(blog.id, { preparing: false });
      sync.folder.status("All files transferred");
      done(null, () => {});
    } catch (e) {
      console.log(clfdate(), "Google Drive Client", e);

      let error = "Failed to set up account";

      if (e.message === "Email changed") {
        // don't store this error, the user is changing their email
        // we just want to stop the current setup process
        error = null;
      }

      if (e.message === "Permission to set up revoked") {
        error = null;
      }

      // check that the blog still exists in the database
      const existingBlog = await database.blog.get(blog.id);

      if (existingBlog) {
        await database.blog.store(blog.id, {
          error,
          folderId: null,
          folderName: null,
        });
      }

      if (done) done(null, () => {});
    }
  });

/**
 * List the contents of root folder.
 */
async function findEmptySharedFolder(blogID, drive, email, status) {
  // Determine if the blog's folder is empty
  const itemsInBlogFolder = await fs.readdir(localPath(blogID, "/"));
  const emptyBlogFolder =
    itemsInBlogFolder.filter((item) => !item.startsWith(".")).length === 0;

  // List all shared folders owned by the given email
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${email}' in owners and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
  });

  const existingFolderIDsForEmail = [];

  await database.blog.iterate(async function (blogID, account) {
    if (account && account.folderId && account.email === email) {
      existingFolderIDsForEmail.push(account.folderId);
    }
  });

  console.log(
    clfdate(),
    "Google Drive Client",
    "Found",
    existingFolderIDsForEmail.length,
    "existing folders for",
    email
  );

  // Filter out folders that are already in use by other blogs
  res.data.files = res.data.files.filter(
    (file) => !existingFolderIDsForEmail.includes(file.id)
  );

  console.log(
    clfdate(),
    "Google Drive Client",
    "Found",
    res.data.files.length,
    "shared folders for",
    email
  );

  // No folders shared with the service account yet
  if (res.data.files.length === 0) {
    return null;
  }

  if (res.data.files.length === 1) {
    // Handle the case where there is only one folder
    const folder = res.data.files[0];

    // List the contents of the folder
    const folderContents = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${folder.id}' in parents and trashed = false`,
    });

    if (folderContents.data.files.length > 0 && !emptyBlogFolder) {

    status("Waiting for invite to empty Google Drive folder");

      await database.blog.store(blogID, {
          nonEmptyFolderShared: true,
      });

      return null;

    } else {
      // If the folder is empty, or the blog folder is empty, use it
      return {
        folderId: folder.id,
        folderName: folder.name,
        // only pull from drive if the blog folder is empty
        pullFromDrive: folderContents.data.files.length > 0 && emptyBlogFolder,
      };
    }
  }

  // Handle the case where there are multiple folders
  for (const folder of res.data.files) {
    // List the contents of the current folder
    const folderContents = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      q: `'${folder.id}' in parents and trashed = false`,
    });

    // If the folder is empty, return it
    if (folderContents.data.files.length === 0) {
      return { folderId: folder.id, folderName: folder.name };
    }
  }

  // If no empty folder is found, wait and retry
  return null;
}

module.exports = dashboard;
