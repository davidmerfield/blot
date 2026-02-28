const Entry = require("models/entry");
const Entries = require("models/entries");
const client = require("models/client-new");
const { promisify } = require("util");

var lists = ["all", "created", "entries", "drafts", "scheduled", "pages"];

const pruneMissing = promisify(Entries.pruneMissing);
const getEntry = promisify(Entry.get);
const setEntry = promisify(Entry.set);

function main(blog, callback) {
  const report = [];

  (async function () {
    await pruneMissing(blog.id);

    for (const list of lists) {
      const key = "blog:" + blog.id + ":" + list;
      const ids = await client.zRevRange(key, 0, -1);

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
