const config = require("config");
const express = require("express");
const site = new express.Router();

const sync = require("clients/google-drive/sync");
const database = require("clients/google-drive/database");

site
  .route("/webhook/changes.watch/:serviceAccountId")
  .post(async function (req, res) {
    const blogIDs = [];

    await database.blog.iterateByServiceAccountId(
      req.params.serviceAccountId,
      async function (blogID, account) {
        blogIDs.push(blogID);
      }
    );

    if (!blogIDs.length) {
      return res.sendStatus(200);
    }

    // sync all blogs in parallel but if one errors don't stop the others
    await Promise.all(
      blogIDs.map(async (blogID) => {
        try {
          await sync(blogID);
        } catch (e) {
          console.error("Google Drive client:", e.message);
        }
      })
    );

    res.sendStatus(200);
  });

module.exports = site;
