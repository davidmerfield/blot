// docker exec -it blot-node-app-1 node scripts/dropbox/reset.js

const reset = require("clients/dropbox/sync/reset-to-blot");
const eachBlogOrOneBlog = require("../each/eachBlogOrOneBlog");
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

let needsConfirmation = false;
let blogCount = 0;

const processBlog = async (blog) => {
  if (!blog || blog.isDisabled) return;
  if (blog.client !== "dropbox") return;

  loadProcessed();

  if (alreadyProcessed.includes(blog.id)) {
    console.log("Blog already processed", blog.id);
    return;
  }

  blogCount++;

  if (!process.argv[2] && blogCount === 1) {
    // First blog in all-blogs mode, need confirmation
    needsConfirmation = true;
    const confirmed = await getConfirmation(
      "Are you sure you want to resync all these blogs from Dropbox?"
    );

    if (!confirmed) {
      console.log("Reset cancelled!");
      process.exit(0);
    }
  }

  console.log("Resetting blog", blog.id);
  try {
    await reset(blog.id);
    addBlogIDToProcessed(blog.id);
    console.log("Reset blog", blog.id);
  } catch (e) {
    console.log("Error resetting blog", blog.id, e);
  }
};

if (require.main === module) {
  const identifier = process.argv[2];

  if (!identifier) {
    console.log("Blogs to resync: (will prompt for confirmation)");
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
