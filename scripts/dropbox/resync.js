// Resync Dropbox blogs by walking folder structure and performing a full reset
// Usage: node scripts/dropbox/resync.js [blog-identifier]

const eachBlogOrOneBlog = require("../each/eachBlogOrOneBlog");
const resetToBlot = require("clients/dropbox/sync/reset-to-blot");

let totalDropboxBlogs = 0;
let successfulResyncs = 0;
let failedResyncs = 0;
const errors = [];

const processBlog = async (blog) => {
  if (!blog || blog.isDisabled) return;
  if (blog.client !== "dropbox") return;

  totalDropboxBlogs++;

  const publish = (...args) => {
    console.log(`Dropbox resync ${blog.title || "Untitled"} ${blog.id}:`, ...args);
  };

  console.log(
    `Starting Dropbox resync for ${blog.id} (${blog.handle || "no handle"})`
  );

  try {
    await resetToBlot(blog.id, publish);
    successfulResyncs++;
    console.log(
      `✅ Completed Dropbox resync for ${blog.id} (${blog.handle || "no handle"})`
    );
  } catch (err) {
    failedResyncs++;
    const message = err && err.message ? err.message : err;
    console.error(
      `❌ Dropbox resync failed for ${blog.id} (${blog.handle || "no handle"}):`,
      message
    );
    errors.push({
      blogID: blog.id,
      handle: blog.handle,
      error: message,
    });
  }

  if (totalDropboxBlogs % 50 === 0) {
    console.log(
      `Progress: ${totalDropboxBlogs} Dropbox blog${
        totalDropboxBlogs !== 1 ? "s" : ""
      } processed, ${successfulResyncs} successful, ${failedResyncs} failed...`
    );
  }
};

const summarize = () => {
  console.log(`\n${"=".repeat(60)}`);
  console.log("Dropbox resync summary:");
  console.log(`  Total Dropbox blogs processed: ${totalDropboxBlogs}`);
  console.log(`  Successful resyncs: ${successfulResyncs}`);
  console.log(`  Failed resyncs: ${failedResyncs}`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.slice(0, 10).forEach((error) => {
      console.log(
        `  Blog ${error.blogID} (${error.handle || "no handle"}): ${error.error}`
      );
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }

  if (failedResyncs > 0) {
    console.log("\n⚠️  Some Dropbox resyncs failed. Review errors above.");
  } else if (totalDropboxBlogs > 0) {
    console.log("\n✅ All Dropbox blogs resynced successfully!");
  } else {
    console.log("\nℹ️  No Dropbox blogs were processed.");
  }
};

if (require.main === module) {
  const identifier = process.argv[2];

  if (identifier) {
    console.log(`Resyncing Dropbox blog: ${identifier}\n`);
  } else {
    console.log("Starting Dropbox resync for all Dropbox blogs...");
    console.log("Iterating over all blogs in series...\n");
  }

  eachBlogOrOneBlog(processBlog)
    .then(() => {
      summarize();
      process.exit(failedResyncs > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("Dropbox resync failed:", err.message || err);
      process.exit(1);
    });
}

module.exports = processBlog;
