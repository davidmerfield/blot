// docker exec -it blot-node-app-1 node scripts/dropbox/reset.js

const reset = require("clients/dropbox/sync/reset-to-blot");
const get = require("../get/blog");
const each = require("../each/blog");
const getConfirmation = require("../util/getConfirmation");

if (process.argv[2]) {
  get(process.argv[2], async function (err, user, blog) {
    if (err) throw err;

    console.log("Resetting folder from Blot to Dropbox");
    await reset(blog.id);
    console.log("Reset folder from Blot to Dropbox");

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

      console.log("Blogs to resync: ", blogIDsToReset.length);

      const confirmed = await getConfirmation(
        "Are you sure you want to resync all these blogs from Dropbox?"
      );

      if (!confirmed) {
        console.log("Reset cancelled!");
        process.exit();
      }

      for (let i = 0; i < blogIDsToReset.length; i++) {
        const blogID = blogIDsToReset[i];
        console.log("Resetting blog", blogID);
        try {
          await reset(blogID);
          console.log("Reset blog", blogID);
        } catch (e) {
          console.log("Error resetting blog", blogID, e);
        }
      }

      console.log("All blogs reset!");
      process.exit();
    }
  );
}
