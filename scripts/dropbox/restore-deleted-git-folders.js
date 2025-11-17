const fs = require("fs");
const path = require("path");
const eachBlog = require("../each/blog");
const getConfirmation = require("../util/getConfirmation");
const createClient = require("clients/dropbox/util/createClient");
const localPath = require("helper/localPath");

const posixJoin = path.posix.join;

const stats = {
  blogsProcessed: 0,
  gitFoldersFound: 0,
  filesRestored: 0,
};

const getClient = (blogID) => {
  return new Promise((resolve, reject) => {
    createClient(blogID, (err, client, account) => {
      if (err) return reject(err);
      resolve({ client, account });
    });
  });
};

const readTemplateDirectories = async (blogID) => {
  const templateFolders = [];
  const candidates = ["/Templates", "/templates"];

  for (const candidate of candidates) {
    const directory = localPath(blogID, candidate);
    let entries;

    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }

    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .forEach((entry) => {
        templateFolders.push({
          folder: candidate.replace(/^\//, ""),
          name: entry.name,
        });
      });
  }

  return templateFolders;
};

const listAllEntries = async (client, params) => {
  const entries = [];
  let response = await client.filesListFolder(params);
  let result = response.result || response;

  entries.push(...result.entries);

  while (result.has_more) {
    response = await client.filesListFolderContinue({ cursor: result.cursor });
    result = response.result || response;
    entries.push(...result.entries);
  }

  return entries;
};

const findDeletedGitFolders = async (client, templatePath) => {
  const entries = await listAllEntries(client, {
    path: templatePath,
    recursive: true,
    include_deleted: true,
  });

  return entries.filter(
    (entry) => entry[".tag"] === "deleted" && entry.name === ".git"
  );
};

const listDeletedGitFiles = async (client, gitPath) => {
  const parentPath = posixJoin(gitPath, "..", "");
  const entries = await listAllEntries(client, {
    path: parentPath,
    recursive: true,
    include_deleted: true,
  });

  return entries.filter((entry) => {
    if (!entry.path_lower.startsWith(gitPath + "/")) return false;
    if (entry.path_lower === gitPath) return false;

    return entry[".tag"] === "file" || entry[".tag"] === "deleted";
  });
};

const getLatestRevision = async (client, filePath) => {
  const response = await client.filesListRevisions({ path: filePath });
  const result = response.result || response;

  if (!result.entries || !result.entries.length) return null;

  return result.entries.find((revision) => revision.is_current) || result.entries[0];
};

const restoreFile = (client, filePath, rev) => {
  return client.filesRestore({ path: filePath, rev });
};

const restoreGitFolder = async (client, blog, gitFolder, files, templateName) => {
  const message = `Restore .git folder at ${gitFolder.path_display} containing ${files.length} files for blog ${blog.id} (${blog.handle})?`;

  const confirmed = await getConfirmation(message);

  if (!confirmed) {
    console.log("Skipped", gitFolder.path_display);
    return 0;
  }

  let restored = 0;

  for (const file of files) {
    try {
      const revision = await getLatestRevision(client, file.path_lower);
      if (!revision) {
        console.log("No revisions found for", file.path_display);
        continue;
      }

      await restoreFile(client, file.path_lower, revision.rev);
      restored += 1;
      console.log("Restored", file.path_display, "in", templateName);
    } catch (err) {
      console.log("Error restoring", file.path_display, err);
    }
  }

  return restored;
};

const processBlog = async (blog) => {
  stats.blogsProcessed += 1;

  const templates = await readTemplateDirectories(blog.id);

  if (!templates.length) {
    console.log("No template directories for", blog.id, blog.handle);
    return;
  }

  let client;
  let account;

  try {
    ({ client, account } = await getClient(blog.id));
  } catch (err) {
    console.log("Error creating Dropbox client for", blog.id, err);
    return;
  }

  for (const template of templates) {
    const templatePath = posixJoin(account.folder || "/", template.folder, template.name);

    console.log(
      "Checking template",
      template.name,
      "at",
      templatePath,
      "for blog",
      blog.id,
      blog.handle
    );

    let gitFolders;

    try {
      gitFolders = await findDeletedGitFolders(client, templatePath);
    } catch (err) {
      console.log("Error listing template", templatePath, err);
      continue;
    }

    if (!gitFolders.length) continue;

    stats.gitFoldersFound += gitFolders.length;

    for (const gitFolder of gitFolders) {
      let files;

      try {
        files = await listDeletedGitFiles(client, gitFolder.path_lower);
      } catch (err) {
        console.log("Error listing deleted files for", gitFolder.path_display, err);
        continue;
      }

      if (!files.length) {
        console.log("No deleted files found in", gitFolder.path_display);
        continue;
      }

      try {
        const restored = await restoreGitFolder(
          client,
          blog,
          gitFolder,
          files,
          template.name
        );
        stats.filesRestored += restored;
      } catch (err) {
        console.log(
          "Error during restoration for",
          gitFolder.path_display,
          err
        );
      }
    }
  }
};

eachBlog(
  function (user, blog, next) {
    if (!blog || blog.client !== "dropbox") return next();

    processBlog(blog)
      .catch((err) => {
        console.log("Error processing blog", blog.id, err);
      })
      .finally(next);
  },
  function () {
    console.log("Processed blogs:", stats.blogsProcessed);
    console.log("Deleted .git folders found:", stats.gitFoldersFound);
    console.log("Files restored:", stats.filesRestored);
    process.exit();
  }
);
