// docker exec -it blot-node-app-1 node scripts/dropbox/reset.js
const lowerCaseContents = require("sync/lowerCaseContents");
const get = require("../get/blog");
const each = require("../each/blog");
const getConfirmation = require("../util/getConfirmation");

if (process.argv[2]) {
  get(process.argv[2], async function (err, user, blog) {
    if (err) throw err;

    console.log("Restoring case of folder contents");
    // Turns lowercase files and folders in the blogs directory
    // into their real, display case for transition to other clients
    await lowerCaseContents(blog.id, { restore: true });
    console.log("Restored case of folder contents");

    process.exit();
  });
} else {
  const blogIDsToReset = [];
  each(
    (user, blog, next) => {
      if (!blog || blog.isDisabled) return next();
      if (blog.client !== "dropbox") return next();

      blogIDsToReset.push(blog.id);
      next();
    },
    async (err) => {
      if (err) throw err;

      console.log(
        "Blogs to restore the case of items in the folders: ",
        blogIDsToReset.length
      );

      const confirmed = await getConfirmation(
        "Are you sure you want to restore the case of items in the folders of all these blogs?"
      );

      if (!confirmed) {
        console.log("Reset cancelled!");
        process.exit();
      }

      for (let i = 0; i < blogIDsToReset.length; i++) {
        const blogID = blogIDsToReset[i];
        try {
          console.log("Restoring case of folder contents");
          await lowerCaseContents(blogID, { restore: true });
          console.log("Restored case of folder contents");
        } catch (e) {
          console.log("Error resetting blog", blogID, e);
        }
      }

      console.log("All blogs reset!");
      process.exit();
    }
  );
}
