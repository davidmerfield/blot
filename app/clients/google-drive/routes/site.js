const config = require("config");
const clfdate = require("helper/clfdate");
const express = require("express");
const site = new express.Router();

const sync = require("clients/google-drive/sync");
const database = require("clients/google-drive/database");
const hotDocPoller = require("clients/google-drive/serviceAccount/hotDocPoller");

const parseCandidateIds = (req) => {
  const fileIds = new Set();
  const folderIds = new Set();

  const pushIfString = (collection, value) => {
    if (typeof value === "string" && value.trim()) {
      collection.add(value.trim());
    }
  };

  const resourceUri = req.headers["x-goog-resource-uri"];
  if (typeof resourceUri === "string") {
    const fileMatch = resourceUri.match(/files\/([a-zA-Z0-9_-]+)/);
    const folderMatch = resourceUri.match(/folders\/([a-zA-Z0-9_-]+)/);

    if (fileMatch) pushIfString(fileIds, fileMatch[1]);
    if (folderMatch) pushIfString(folderIds, folderMatch[1]);
  }

  const body = req.body || {};

  [body.fileId, body.fileID, body.id, body.resourceId].forEach((value) =>
    pushIfString(fileIds, value)
  );

  [body.folderId, body.folderID, body.parentId].forEach((value) =>
    pushIfString(folderIds, value)
  );

  const files = Array.isArray(body.files) ? body.files : [];
  files.forEach((file) => {
    if (file && typeof file === "object") {
      pushIfString(fileIds, file.id || file.fileId);
      const parents = Array.isArray(file.parents) ? file.parents : [];
      parents.forEach((parent) => pushIfString(folderIds, parent));
    }
  });

  return { fileIds: [...fileIds], folderIds: [...folderIds] };
};

site.route("/webhook/changes.watch/:serviceAccountId").post(async function (req, res) {
  const { serviceAccountId } = req.params;

  console.log(
    `${clfdate()} Google Drive client: Received changes.watch webhook for service account ${serviceAccountId}`
  );

  const blogAccounts = [];

  await database.blog.iterateByServiceAccountId(serviceAccountId, async function (blogID, account) {
    blogAccounts.push({
      blogID,
      folderId: account.folderId,
    });
  });

  if (!blogAccounts.length) {
    console.log(
      `${clfdate()} Google Drive client: No blogs found for service account ${serviceAccountId}`
    );
    return res.sendStatus(200);
  }

  const { fileIds, folderIds } = parseCandidateIds(req);
  const hasSignals = fileIds.length > 0 || folderIds.length > 0;
  let enqueuedCount = 0;

  if (config.google_drive.hot_doc_poller.enabled) {
    try {
      for (const { blogID, folderId } of blogAccounts) {
        const folderMatched = folderIds.includes(folderId);

        if (fileIds.length) {
          if (!folderIds.length || folderMatched) {
            for (const fileId of fileIds) {
              hotDocPoller.enqueue({
                blogID,
                serviceAccountId,
                fileId,
                folderId,
              });
              enqueuedCount += 1;
            }
          }
          continue;
        }

        if (!hasSignals || folderMatched) {
          hotDocPoller.enqueue({
            blogID,
            serviceAccountId,
            folderId,
          });
          enqueuedCount += 1;
        }
      }

      if (enqueuedCount > 0) {
        console.log(
          `${clfdate()} Google Drive client: hotDocPoller enqueued ${enqueuedCount} candidates for service account ${serviceAccountId}`
        );
        return res.sendStatus(200);
      }
    } catch (err) {
      console.error(
        `${clfdate()} Google Drive client: hotDocPoller enqueue failed for service account ${serviceAccountId}`,
        err.message
      );
    }
  }

  // fallback path: if we're uncertain or polling is disabled, sync all blogs in parallel.
  await Promise.all(
    blogAccounts.map(async ({ blogID }) => {
      try {
        console.log(`${clfdate()} Google Drive client: Syncing blog ${blogID}`);
        await sync(blogID);
      } catch (e) {
        console.error("Google Drive client:", e.message);
      }
    })
  );

  res.sendStatus(200);
});

module.exports = site;
