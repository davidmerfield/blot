const get = require("../get/blog");
const each = require("../each/blog");
const async = require("async");
const fromiCloud = require("clients/icloud/sync/fromiCloud");
const establishSyncLock = require("clients/icloud/util/establishSyncLock");
const database = require("clients/icloud/database");

async function sync(blog) {
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
}

if (process.argv[2]) {
  get(process.argv[2], async function (err, user, blog) {
    if (err) throw err;

    await sync(blog);
    process.exit();
  });
} else {
  var blogs = [];

  each(
    function (user, blog, next) {
      if (blog.client === "icloud") blogs.push(blog);
      next();
    },
    function () {
      // Sort blogs to sync least recently synced first
      blogs.sort(function (a, b) {
        return a.cacheID > b.cacheID ? 1 : -1;
      });

      async.eachSeries(
        blogs,
        async function (blog) {
          await sync(blog);
        },
        function (err) {
          if (err) throw err;
          console.log("Done!");
          process.exit();
        }
      );
    }
  );
}
