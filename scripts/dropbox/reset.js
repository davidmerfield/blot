// docker exec -it blot-node-app-1 node scripts/dropbox/reset.js

const reset = require("clients/dropbox/sync/reset-to-blot");
const get = require("../get/blog");
const each = require("../each/blog");
const getConfirmation = require("../util/getConfirmation");
const config = require("config");
const fs = require("fs-extra");

const alreadyProcessed = [];
const processedFile = config.data_directory + "/dropbox-reset-processed.json";

const loadProcessed = () => {
  try {
    const json = JSON.parse(fs.readFileSync(processedFile, "utf8"));
    json.forEach((blogID) => {
      if (!alreadyProcessed.includes(blogID)) alreadyProcessed.push(blogID);
    });
  } catch (e) {}
};

const addBlogIDToProcessed = (blogID) => {
  let json = [];
  try {
    json = JSON.parse(fs.readFileSync(processedFile, "utf8"));
  } catch (e) {
    console.log(e);
  }
  if (!json.includes(blogID)) json.push(blogID);
  fs.outputFileSync(processedFile, JSON.stringify(json, null, 2));
};

loadProcessed();
console.log("Already processed blogs", alreadyProcessed.length);

if (process.argv[2] && process.argv[2] !== "-r") {
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
      if (alreadyProcessed.includes(blog.id)) return next();
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

      // if one of the arguments to this script is '-r', then
      // shuffle the order of the blogs to reset so we can run
      // this script in parallel on multiple servers
      if (process.argv.includes("-r")) {
        console.log("Shuffling the order of the blogs to reset");
        blogIDsToReset.sort(() => Math.random() - 0.5);
      } else {
        console.log("Sorting the order of the blogs to reset");
        blogIDsToReset.sort();
      }

      for (let i = 0; i < blogIDsToReset.length; i++) {
        const blogID = blogIDsToReset[i];
        console.log("Resetting blog", blogID);
        try {
          loadProcessed();

          if (alreadyProcessed.includes(blogID)) {
            console.log("Blog already processed", blogID);
            continue;
          }

          await reset(blogID);
          addBlogIDToProcessed(blogID);
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
