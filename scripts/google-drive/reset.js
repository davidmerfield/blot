// docker exec -it blot-node-app-1 node scripts/google-drive/reset.js

const reset = require("clients/google-drive/sync/resetFromDrive");
const eachBlogOrOneBlog = require("../each/eachBlogOrOneBlog");
const getConfirmation = require("../util/getConfirmation");

let blogCount = 0;

const processBlog = async (blog) => {
  if (!blog || blog.isDisabled) return;
  if (blog.client !== "google-drive") return;

  blogCount++;

  if (!process.argv[2] && blogCount === 1) {
    // First blog in all-blogs mode, need confirmation
    const confirmed = await getConfirmation(
      "Are you sure you want to reset all these blogs?"
    );

    if (!confirmed) {
      console.log("Reset cancelled!");
      process.exit(0);
    }
  }

  console.log("Resetting blog", blog.id);
  await reset(blog.id);
  console.log("Reset blog", blog.id);
};

if (require.main === module) {
  const identifier = process.argv[2];

  if (!identifier) {
    console.log("Blogs to reset: (will prompt for confirmation)");
  }

  eachBlogOrOneBlog(processBlog)
    .then(() => {
      console.log("All blogs reset!");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Error:", err);
      process.exit(1);
    });
}
