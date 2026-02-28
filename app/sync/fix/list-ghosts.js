const Entry = require("models/entry");
const Entries = require("models/entries");
const client = require("models/client");

var lists = ["all", "created", "entries", "drafts", "scheduled", "pages"];

function main(blog, callback) {
  const report = [];

  const pruneMissing = (blogID) =>
    new Promise((resolve, reject) => {
      Entries.pruneMissing(blogID, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

  const getEntry = (blogID, id) =>
    new Promise((resolve) => {
      Entry.get(blogID, id, (entry) => resolve(entry));
    });

  const setEntry = (blogID, id, entry) =>
    new Promise((resolve, reject) => {
      Entry.set(blogID, id, entry, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

  (async function () {
    await pruneMissing(blog.id);

    for (const list of lists) {
      const key = "blog:" + blog.id + ":" + list;
      const ids = await client.zRange(key, 0, -1, { REV: true });

      for (const id of ids) {
        const entry = await getEntry(blog.id, id);
        if (entry && entry.id === id) continue;

        report.push([list, "MISMATCH", id]);
        await client.zRem(key, id);

        if (entry) await setEntry(blog.id, entry.id, entry);
      }
    }

    callback(null, report);
  })().catch(callback);
}

module.exports = main;
