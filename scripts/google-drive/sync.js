const sync = require("clients/google-drive/sync");
const eachBlogOrOneBlog = require("../each/eachBlogOrOneBlog");

const processBlog = async (blog) => {
  if (blog.client !== "google_drive") return;

  console.log("Syncing", blog.id);
  await sync(blog.id);
  console.log("Done syncing", blog.id);
};

if (require.main === module) {
  eachBlogOrOneBlog(processBlog)
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}
