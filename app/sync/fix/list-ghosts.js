const Entry = require("models/entry");
const Entries = require("models/entries");
const client = require("models/client");
const { promisify } = require("util");

var lists = ["all", "created", "entries", "drafts", "scheduled", "pages"];

function pruneMissing(blogID) {
  return promisify(Entries.pruneMissing.bind(Entries))(blogID);
}

function getEntry(blogID, id) {
  return promisify((next) => Entry.get(blogID, id, (entry) => next(null, entry)))();
}

function setEntry(blogID, id, entry) {
  return promisify(Entry.set.bind(Entry))(blogID, id, entry);
}

function main(blog, callback) {
  const report = [];

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
