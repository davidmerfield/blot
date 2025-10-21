const resetFromBlot = require("../sync/resetToDrive");
const database = require("../database");
const clfdate = require("helper/clfdate");

// Maximum time to wait for the user to complete the setup
// before aborting and requiring them to start again
const SETUP_TIMEOUT = 1000 * 60 * 60 * 2; // 2 hours

async function finishSetup(blog, drive, email, sync) {
  let folderId;
  let folderName;

  const checkWeCanContinue = async () => {
    const {
      preparing,
      email: latestEmail,
      startedSetup,
    } = await database.blog.get(blog.id);

    // the user has edited their Google Drive account
    // email address so abort the setup, release the sync
    // lock and allow the other setup process to start
    if (latestEmail !== email) throw new Error("Email changed");

    // the user has cancelled the setup
    if (!preparing) throw new Error("Permission to set up revoked");

    // if the setup process has been running for too long then abort
    if (startedSetup && Date.now() - startedSetup > SETUP_TIMEOUT) {
      throw new Error("Setup timed out");
    }
  };

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
    sync.done(null, () => {});
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

    if (sync && typeof sync.done === "function") {
      sync.done(null, () => {});
    }
  }
}

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

const establishSyncLock = require("../util/establishSyncLock");
const createDriveClient = require("../serviceAccount/createDriveClient");
const { promisify } = require("util");
const getBlog = promisify(require("models/blog").get);

async function restartSetupProcesses() {
  console.log(clfdate(), "Google Drive Client", "Restarting setup processes");

  const blogsToRestart = [];

  try {
    await database.blog.iterate(async (blogID, account) => {
      if (
        // Only attempt to restart if the account is stuck in 'preparing' state
        account?.preparing &&
        // And it has a service account ID
        account?.serviceAccountId &&
        // And it doesn't have a folder ID yet
        !account?.folderId
      ) {
        blogsToRestart.push({ blogID, account });
      }
    });
  } catch (e) {
    console.log(
      clfdate(),
      "Google Drive Client",
      "restartSetupProcesses: Failed to load blogs",
      e
    );
    return;
  }

  for (const { blogID, account } of blogsToRestart) {
    console.log(
      clfdate(),
      "Google Drive Client",
      "Restarting setup for blog",
      blogID
    );

    const serviceAccountId = account.serviceAccountId;
    const email = account.email;

    if (!serviceAccountId || !email) {
      console.log(
        clfdate(),
        "Google Drive Client",
        "Missing serviceAccountId or email",
        blogID
      );
      continue;
    }

    let blog;

    try {
      blog = await getBlog({ id: blogID });

      if (!blog) {
        throw new Error("Blog no longer exists");
      }
    } catch (e) {
      console.log(
        clfdate(),
        "Google Drive Client",
        "Failed to load blog or account details",
        e
      );
      continue;
    }

    let drive;

    try {
      drive = await createDriveClient(serviceAccountId);
    } catch (e) {
      console.log(
        clfdate(),
        "Google Drive Client",
        "Failed to create drive client"
      );
      continue;
    }

    let sync;

    try {
      sync = await establishSyncLock(blog.id);
    } catch (e) {
      console.log(
        clfdate(),
        "Google Drive Client",
        "Failed to establish sync lock"
      );
      continue;
    }

    sync.folder.status("Waiting for invite to Google Drive folder");
    finishSetup(blog, drive, email, sync);
  }
}

module.exports = finishSetup;
module.exports.restartSetupProcesses = restartSetupProcesses;
