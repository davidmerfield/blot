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
  // List shared drives (Team Drives) - used to allow root-level folders inside them
  let sharedDriveIds = new Set();
  try {
    let pageToken;
    const allSharedDrives = [];
    do {
      const drivesRes = await drive.drives.list({
        pageSize: 100,
        pageToken: pageToken || undefined,
        useDomainAdminAccess: false,
        fields: "nextPageToken, drives(id, name)",
      });
      const drives = drivesRes.data.drives || [];
      allSharedDrives.push(...drives);
      pageToken = drivesRes.data.nextPageToken;
    } while (pageToken);

    sharedDriveIds = new Set(allSharedDrives.map((d) => d.id));

    console.log(
      clfdate(),
      "Google Drive setup (debug):",
      "drives.list (shared drives) count:",
      allSharedDrives.length
    );
    allSharedDrives.forEach((d, i) => {
      console.log(
        clfdate(),
        "Google Drive setup (debug):",
        `  shared drive [${i + 1}] id=${d.id} name=${JSON.stringify(d.name)}`
      );
    });
  } catch (e) {
    console.log(
      clfdate(),
      "Google Drive setup (debug):",
      "drives.list failed:",
      e.message
    );
  }

  // Use sharedWithMe folders and check writer email in permissions (the
  // "'email' in writers" query does not work for folders in shared drives).
  const writerRoles = ["owner", "organizer", "fileOrganizer", "writer"];
  const readerRoles = ["reader", "commenter"];
  let available = [];
  try {
    let pageToken;
    const sharedWithMeItems = [];
    do {
      const sharedRes = await drive.files.list({
        pageSize: 100,
        supportsAllDrives: true,
        corpora: "allDrives",
        includeItemsFromAllDrives: true,
        pageToken: pageToken || undefined,
        fields: "nextPageToken, files(id, name, parents, mimeType)",
        q:
          "sharedWithMe = true and trashed = false and mimeType = 'application/vnd.google-apps.folder'",
      });
      const files = sharedRes.data.files || [];
      sharedWithMeItems.push(...files);
      pageToken = sharedRes.data.nextPageToken;
    } while (pageToken);

    console.log(
      clfdate(),
      "Google Drive setup (debug):",
      "sharedWithMe folders total:",
      sharedWithMeItems.length
    );
    for (let i = 0; i < sharedWithMeItems.length; i++) {
      const file = sharedWithMeItems[i];
      const parentInfo = file.parents?.length
        ? `parents=[${file.parents.join(", ")}]`
        : "no parents";
      const hasNoParents = !file.parents || file.parents.length === 0;
      const notInUse = !existingIDs.includes(file.id);

      let isWriterForEmail = false;
      try {
        const permRes = await drive.permissions.list({
          fileId: file.id,
          supportsAllDrives: true,
          fields: "permissions(type, role, emailAddress, displayName)",
        });
        const perms = permRes.data.permissions || [];
        isWriterForEmail = perms.some(
          (p) =>
            writerRoles.includes(p.role) &&
            p.emailAddress &&
            p.emailAddress.toLowerCase() === email.toLowerCase()
        );
        const writers = perms
          .filter((p) => writerRoles.includes(p.role))
          .map((p) => p.emailAddress || p.displayName || `${p.type}:${p.role}`);
        const readers = perms
          .filter((p) => readerRoles.includes(p.role))
          .map((p) => p.emailAddress || p.displayName || `${p.type}:${p.role}`);
        console.log(
          clfdate(),
          "Google Drive setup (debug):",
          `  sharedWithMe [${i + 1}] id=${file.id} name=${JSON.stringify(file.name)} ${parentInfo}`
        );
        console.log(
          clfdate(),
          "Google Drive setup (debug):",
          `    writers: ${writers.length ? writers.join(", ") : "(none)"}`
        );
        console.log(
          clfdate(),
          "Google Drive setup (debug):",
          `    readers: ${readers.length ? readers.join(", ") : "(none)"}`
        );
      } catch (permErr) {
        console.log(
          clfdate(),
          "Google Drive setup (debug):",
          "    permissions failed:",
          permErr.message
        );
      }

      if (isWriterForEmail && hasNoParents && notInUse) {
        available.push({ id: file.id, name: file.name });
      }
    }
    console.log(
      clfdate(),
      "Google Drive setup (debug):",
      "available (sharedWithMe, writer match, no parents, not in use):",
      available.length,
      available.map((f) => f.name)
    );
  } catch (e) {
    console.log(
      clfdate(),
      "Google Drive setup (debug):",
      "sharedWithMe query failed:",
      e.message
    );
  }

  return available;
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

    console.log(
      clfdate(),
      "Google Drive Client",
      "checkEditorPermissions:",
      folderId,
      permissions
    );
    return permissions.some(
      (perm) =>
        (perm.type === "user" || perm.type === "anyone") &&
        (perm.role === "writer" || perm.role === "organizer")
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

const establishSyncLock = require("sync/establishSyncLock");
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
