var Entries = require("models/entries");
var get = require("../blog/get");
var handle = process.argv[2];
var query = process.argv[3];

if (!handle) {
  console.log("- pass a handle as the first argument");
}

if (!query) {
  console.log("- pass a query to search entries in the blog's folder");
}

if (!handle || !query) {
  return process.exit();
}

const normalizedQuery = query.trim().toLowerCase();

get(handle, function (user, blog) {
  Entries.each(
    blog.id,
    function (entry, nextEntry) {
      if (!entry || entry.deleted || typeof entry.path !== "string") {
        return nextEntry();
      }

      if (entry.path.toLowerCase().indexOf(normalizedQuery) === 0) {
        console.log(entry.path);
      }

      nextEntry();
    },
    function () {
      console.log();
      console.log("Search complete!");
      process.exit();
    }
  );
});
