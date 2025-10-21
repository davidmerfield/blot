const sync = require("clients/google-drive/sync");
const get = require("../get/blog");

get(process.argv[2], async function (err, user, blog) {
  if (err) throw err;

  console.log("Syncing", blog.id);
  await sync(blog.id);
  console.log("Done");
  
  process.exit();
});
