// docker exec -it blot-node-app-1 node scripts/dropbox/fix-entry-dates.js

const get = require("../get/blog");
const each = require("../each/blog");
const { promisify } = require("util");
const Entries = require("models/entries");
const Entry = require("models/entry");

const getConfirmation = require("../util/getConfirmation");

const getAllIDs = promisify(Entries.getAllIDs);
const setEntry = promisify(Entry.set);
const getEntry = (blogID, id) =>
  new Promise((resolve, reject) =>
    Entry.get(blogID, id, (err, entry) => {
      if (err) return reject(err);
      resolve(entry);
    })
  );

const main = async (blogID) => {
  const ids = await getAllIDs(blogID);

  for (const id of ids) {
    if (id === id.toLowerCase()) {
      console.log("Skipping lowercase path", id);
      continue;
    }

    const entry = await getEntry(blogID, id);

    if (entry.deleted) {
      console.log("Skipping deleted", id);
      continue;
    }

    // Entry has a publish date older than within last 24 hours
    if (Date.now() - entry.dateStamp > 24 * 60 * 60 * 1000) {
      console.log("Skipping older entry", id);
      continue;
    }

    const deletedEntry = await getEntry(blogID, id.toLowerCase());

    if (!deletedEntry) {
      console.log("Skipping missing lowercase entry", id);
      continue;
    }

    if (deletedEntry.dateStamp === entry.dateStamp) {
      console.log("Skipping matching dateStamps", id);
      continue;
    }

    // update the date of the original entry to match the deleted
    // lowercase entry
    console.log("Updating entry", id, "to match", id.toLowerCase());
    console.log(
      "Current dateStamp:",
      entry.dateStamp,
      new Date(entry.dateStamp)
    );
    console.log(
      "Deleted dateStamp:",
      deletedEntry.dateStamp,
      new Date(deletedEntry.dateStamp)
    );

    const confirmation = await getConfirmation(
      `${blogID} update ${id} to match ${id.toLowerCase()}?`
    );

    if (!confirmation) {
      console.log("Skipping unconfirmed", id);
      continue;
    }

    await setEntry(blogID, id, {
      dateStamp: deletedEntry.dateStamp,
      created: deletedEntry.created,
      updated: deletedEntry.updated,
    });
  }
};

if (process.argv[2]) {
  get(process.argv[2], async function (err, user, blog) {
    if (err) throw err;

    console.log("Resetting folder from Blot to Dropbox");
    await main(blog.id);
    console.log("Reset folder from Blot to Dropbox");

    process.exit();
  });
} else {
  const blogIDs = [];
  each(
    (user, blog, next) => {
      if (!blog || blog.isDisabled) return next();
      if (blog.client !== "dropbox") return next();
      blogIDs.push(blog.id);
      next();
    },
    async (err) => {
      if (err) throw err;

      console.log("Blogs to process: ", blogIDs.length);

      const confirmed = await getConfirmation(
        "Are you sure you want to process all these blogs?"
      );

      if (!confirmed) {
        console.log("Processing cancelled!");
        process.exit();
      }

      for (let i = 0; i < blogIDs.length; i++) {
        const blogID = blogIDs[i];
        try {
          await main(blogID);
        } catch (e) {
          console.log("Error processing blog", blogID, e);
        }
      }

      console.log("All blogs processed!");
      process.exit();
    }
  );
}
