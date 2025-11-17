const fs = require("fs").promises;
const path = require("path");
const eachBlog = require("../each/blog");
const localPath = require("helper/localPath");
const getConfirmation = require("../util/getConfirmation");
const createDriveClient = require("clients/google-drive/serviceAccount/createDriveClient");
const database = require("clients/google-drive/database");

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

const listTemplateFolders = async (blogID) => {
  const templates = [];
  const candidateDirs = ["/Templates", "/templates"];

  for (const dir of candidateDirs) {
    const absolutePath = localPath(blogID, dir);

    try {
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          templates.push({ name: entry.name, base: dir });
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
  }

  return templates;
};

const listTrashedChildren = async (drive, parentId) => {
  const trashed = [];
  const stack = [parentId];

  while (stack.length) {
    const currentParent = stack.pop();
    let pageToken;

    do {
      const res = await drive.files.list({
        q: `'${currentParent}' in parents and trashed = true`,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        fields: "nextPageToken, files(id, name, mimeType, parents)",
        pageToken,
      });

      const files = res.data.files || [];

      for (const file of files) {
        trashed.push(file);
        if (file.mimeType === FOLDER_MIME_TYPE) {
          stack.push(file.id);
        }
      }

      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  return trashed;
};

const findDeletedGitFolders = async (drive, templateFolderId) => {
  const gitFolders = [];
  let pageToken;

  do {
    const res = await drive.files.list({
      q: `'${templateFolderId}' in parents and name = '.git' and trashed = true and mimeType = '${FOLDER_MIME_TYPE}'`,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: "nextPageToken, files(id, name, parents)",
      pageToken,
    });

    gitFolders.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return gitFolders;
};

const restoreFiles = async (drive, files) => {
  let restored = 0;

  for (const file of files) {
    try {
      await drive.files.update({
        fileId: file.id,
        requestBody: { trashed: false },
        supportsAllDrives: true,
      });
      restored += 1;
    } catch (err) {
      console.error("Failed to restore", file.id, "-", err.message);
    }
  }

  return restored;
};

const processBlog = async (blog) => {
  console.log(`Processing blog ${blog.id} (${blog.handle})`);

  const account = await database.blog.get(blog.id);

  if (!account) {
    console.log("  No Google Drive account info; skipping.");
    return { gitFoldersFound: 0, filesRestored: 0 };
  }

  const { folderId, serviceAccountId } = account;
  const drive = await createDriveClient(serviceAccountId);
  const folder = database.folder(folderId);

  const templates = await listTemplateFolders(blog.id);

  if (!templates.length) {
    console.log("  No template directories found.");
    return { gitFoldersFound: 0, filesRestored: 0 };
  }

  let gitFoldersFound = 0;
  let filesRestored = 0;

  for (const { name, base } of templates) {
    const templatePath = path.posix.join(base, name);
    const templateFolderId = await folder.getByPath(templatePath);

    if (!templateFolderId) {
      console.log(`  Missing template folder in Drive for ${templatePath}; skipping.`);
      continue;
    }

    const gitFolders = await findDeletedGitFolders(drive, templateFolderId);
    gitFoldersFound += gitFolders.length;

    if (!gitFolders.length) {
      console.log(`  No deleted .git folder found for ${templatePath}.`);
      continue;
    }

    for (const gitFolder of gitFolders) {
      const trashedChildren = await listTrashedChildren(drive, gitFolder.id);
      const uniqueFiles = new Map();

      uniqueFiles.set(gitFolder.id, gitFolder);
      for (const file of trashedChildren) {
        uniqueFiles.set(file.id, file);
      }

      const files = Array.from(uniqueFiles.values());
      const message =
        `Restore ${files.length} items for blog ${blog.id} (${blog.handle}), ` +
        `template ${templatePath}, path ${templatePath}/.git?`;

      console.log(`  Found deleted .git at ${templatePath}/.git with ${files.length} items.`);
      const confirmed = await getConfirmation(message);

      if (!confirmed) {
        console.log("  Skipping restore.");
        continue;
      }

      const restoredCount = await restoreFiles(drive, files);
      filesRestored += restoredCount;
      console.log(`  Restored ${restoredCount} items for ${templatePath}/.git.`);
    }
  }

  return { gitFoldersFound, filesRestored };
};

const main = () => {
  let blogsProcessed = 0;
  let totalGitFolders = 0;
  let totalFilesRestored = 0;

  eachBlog(
    (user, blog, next) => {
      if (blog.client !== "google_drive") return next();

      blogsProcessed += 1;

      processBlog(blog)
        .then(({ gitFoldersFound, filesRestored }) => {
          totalGitFolders += gitFoldersFound;
          totalFilesRestored += filesRestored;
          next();
        })
        .catch((err) => {
          console.error(`Error processing blog ${blog.id}:`, err.message);
          next();
        });
    },
    (err) => {
      if (err) {
        console.error("Script terminated with error:", err);
      } else {
        console.log("Processing complete.");
      }

      console.log("Blogs processed:", blogsProcessed);
      console.log("Deleted .git folders found:", totalGitFolders);
      console.log("Files restored:", totalFilesRestored);

      process.exit();
    }
  );
};

if (require.main === module) {
  main();
}
