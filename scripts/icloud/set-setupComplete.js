// docker exec -it blot-node-app-1 node scripts/google-drive/reset.js

const database = require("clients/icloud/database");
const each = require("../each/blog");
const getConfirmation = require("../util/getConfirmation");

const blogIDsToMarkComplete = [];
each(
  async (user, blog, next) => {
    if (!blog || blog.isDisabled) return next();

    if (blog.client !== "icloud") return next();

    const account = await database.get(blog.id);

    if (!account) {
      console.log("SKIP No account found for blog", blog.id);
      return next();
    }

    if (account.error) {
      console.log("SKIP Account has error", blog.id, account.error);
      return next();
    }

    if (!account.sharingLink) {
      console.log("SKIP No sharing link found for blog", blog.id);
      return next();
    }

    if (account.setupComplete) {
      console.log("SKIP Blog already setupComplete", blog.id);
      return next();
    }

    console.log("QUEING", account);
    blogIDsToMarkComplete.push(blog.id);
    next();
  },
  async (err) => {
    if (err) throw err;

    if (!blogIDsToMarkComplete.length) {
      console.log("No blogs to mark setupComplete!");
      process.exit();
    }

    console.log("Blogs to mark complete: ", blogIDsToMarkComplete.length);

    const confirmed = await getConfirmation(
      "Are you sure you want to mark all these blogs as setupComplete? (y/n): "
    );

    if (!confirmed) {
      console.log("Reset cancelled!");
      process.exit();
    }

    for (let i = 0; i < blogIDsToMarkComplete.length; i++) {
      const blogID = blogIDsToMarkComplete[i];
      console.log("Resetting blog", blogID);
      await database.store(blogID, {
        setupComplete: true,
        transferringToiCloud: false,
        error: null,
      });
      console.log("Reset blog", blogID);
    }

    console.log("All blogs reset!");
    process.exit();
  }
);
