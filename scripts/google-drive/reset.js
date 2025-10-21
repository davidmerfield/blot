// docker exec -it blot-node-app-1 node scripts/google-drive/reset.js

const reset = require("clients/google-drive/sync/resetFromDrive");
const get = require("../get/blog");
const each = require("../each/blog");
const readline = require("readline");

async function askForConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

if (process.argv[2]) {
  get(process.argv[2], async function (err, user, blog) {
    if (err) throw err;

    console.log("Resetting folder from Blot to Google Drive");
    await reset(blog.id);
    console.log("Reset folder from Blot to Google Drive");

    process.exit();
  });
} else {
  const blogIDsToReset = [];
  each(
    (user, blog, next) => {
      if (!blog || blog.isDisabled) return next();
      if (blog.client !== "google-drive") return next();

      blogIDsToReset.push(blog.id);
      next();
    },
    async (err) => {
      if (err) throw err;

      console.log("Blogs to reset: ", blogIDsToReset.length);

      const confirmed = await askForConfirmation(
        "Are you sure you want to reset all these blogs? (y/n): "
      );

      if (!confirmed) {
        console.log("Reset cancelled!");
        process.exit();
      }

      for (let i = 0; i < blogIDsToReset.length; i++) {
        const blogID = blogIDsToReset[i];
        console.log("Resetting blog", blogID);
        await reset(blogID);
        console.log("Reset blog", blogID);
      }

      console.log("All blogs reset!");
      process.exit();
    }
  );
}
