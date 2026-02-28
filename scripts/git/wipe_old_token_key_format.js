const createRedisClient = require("models/redis");
const each = require("../each/blog");

async function iterateBlogs(runForBlog) {
  return new Promise((resolve, reject) => {
    each(
      function (user, blog, next) {
        Promise.resolve(runForBlog(user, blog)).then(() => next(), next);
      },
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

async function main() {
  const redis = createRedisClient();

  await redis.connect();

  try {
    await iterateBlogs(async function (user, blog) {
      const key = "blog:" + blog.id + ":git:token";
      const removed = await redis.del(key);

      if (removed > 0) {
        console.log("DEL: " + key);
      }
    });
  } finally {
    await redis.quit();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
