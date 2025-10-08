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
      nonEditorPermissions: false,
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
        const res = await findEmptySharedFolder(
          blog.id,
          drive,
          email,
          sync.folder.status
        );

        // wait 2 seconds before trying again
        if (!res) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        } else {
          folderId = res.folderId;
          folderName = res.folderName;
        }
      } while (!folderId);

      await database.blog.store(blog.id, {
        folderId,
        folderName,
        nonEmptyFolderShared: false,
        nonEditorPermissions: false,
      });

      await checkWeCanContinue();
      sync.folder.status("Ensuring new folder is in sync");

      await resetFromBlot(blog.id, sync.folder.status);

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
 * Find an empty shared folder that can be used for syncing.
 */
async function findEmptySharedFolder(blogID, drive, email, status) {
  // Get all shared folders owned by email that aren't already in use
  const existingFolderIDs = await getExistingFolderIDs(email);
  const availableFolders = await getAvailableFolders(
    drive,
    email,
    existingFolderIDs
  );

  if (availableFolders.length === 0) {
    await database.blog.store(blogID, {
      nonEmptyFolderShared: false,
      nonEditorPermissions: false,
    });
    return null;
  }

  // Process each folder, only storing status for the last unsuccessful one
  for (let i = 0; i < availableFolders.length; i++) {
    const folder = availableFolders[i];
    const isLastFolder = i === availableFolders.length - 1;

    const result = await processFolder(
      folder,
      drive,
      blogID,
      status,
      isLastFolder
    );
    if (result) return result;
  }

  return null;
}

// When the number of google drive, this will get expensive
// we might need to add a way to check if a folderId is already in use
async function getExistingFolderIDs(email) {
  const existingIDs = [];
  await database.blog.iterate(async (blogID, account) => {
    if (account?.folderId && account.email === email) {
      existingIDs.push(account.folderId);
    }
  });
  return existingIDs;
}

async function getAvailableFolders(drive, email, existingIDs) {
  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    fields: "files(id, name, parents, kind, mimeType, owners)",
    q: `'${email}' in owners and 
        trashed = false and 
        mimeType = 'application/vnd.google-apps.folder'`,
  });

  // filter out folders already in use
  // and folders with a defined (non-undefined) parents array
  // by removing folders with parents we avoid syncing to folders
   // that are inside other folders the service account may have access to
  return res.data.files.filter(
    (file) => !existingIDs.includes(file.id) && !file.parents
  );
}

async function processFolder(folder, drive, blogID, status, isLastFolder) {
  // Check folder contents
  const folderContents = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q: `'${folder.id}' in parents and trashed = false`,
  });

  const isEmpty = folderContents.data.files.length === 0;

  // If folder is not empty and blog folder is not empty, skip
  if (!isEmpty) {
    if (isLastFolder) {
      status("Waiting for invite to empty Google Drive folder");
      await database.blog.store(blogID, {
        nonEmptyFolderShared: true,
        nonEditorPermissions: false,
      });
    }
    return null;
  }

  // Check permissions
  const hasEditorPermission = await checkEditorPermissions(drive, folder.id);

  if (!hasEditorPermission) {
    if (isLastFolder) {
      status("Waiting for editor permission on Google Drive folder");
      await database.blog.store(blogID, {
        nonEditorPermissions: true,
        nonEmptyFolderShared: false,
      });
    }
    return null;
  }

  // Return folder if it's valid
  return {
    folderId: folder.id,
    folderName: folder.name,
  };
}

async function checkEditorPermissions(drive, folderId) {
  try {
    const permissionsRes = await drive.permissions.list({
      fileId: folderId,
      supportsAllDrives: true,
      fields: "permissions(role,type)",
    });

    const permissions = permissionsRes.data.permissions || [];
    return permissions.some(
      (perm) =>
        (perm.type === "user" || perm.type === "anyone") &&
        perm.role === "writer"
    );
  } catch (e) {
    console.error(
      clfdate(),
      "Google Drive Client",
      "Failed to load permissions",
      e.message
    );
    return false;
  }
}

module.exports = dashboard;
