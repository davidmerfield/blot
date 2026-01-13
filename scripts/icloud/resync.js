const eachBlogOrOneBlog = require("../each/eachBlogOrOneBlog");
const fromiCloud = require("clients/icloud/sync/fromiCloud");
const establishSyncLock = require("clients/icloud/util/establishSyncLock");
const database = require("clients/icloud/database");

const processBlog = async (blog) => {
  if (blog.client !== "icloud") return;

  console.log("Syncing", blog.title, blog.id, new Date(blog.cacheID));

  try {
    const account = await database.get(blog.id);

    if (account.setupComplete !== true) {
      console.log("SKIP Blog not setupComplete", blog.id);
      return;
    }

    const { done, folder } = await establishSyncLock(blog.id);

    await fromiCloud(blog.id, folder.status, folder.update);

    done();
  } catch (err) {
    console.error("Error syncing", blog.title, blog.id, err);
  }

  console.log("Done syncing", blog.title, blog.id);
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
