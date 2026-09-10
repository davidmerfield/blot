// Runs inside the Blot app container (which sets NODE_PATH so "models/blog"
// resolves), like seed-user.js. Usage:
//
//   node seed-blog.js <owner-email> [handle]
//
// Creates a blog owned by the given user, builds the global templates so the
// blog can render, writes one post and rebuilds it, then prints a single line
// line: SEED_BLOG_RESULT={"host":"...","title":"...","blogID":"..."}. The
// workflow greps that line (other libraries log freely to stdout) and passes
// `host` to proxy/e2e/run.js.
const { promisify } = require("util");
const fs = require("fs-extra");

const User = require("models/user");
const Blog = require("models/blog");
const localPath = require("helper/localPath");
const config = require("config");
const buildTemplates = promisify(require("templates"));
const rebuild = promisify(require("sync/rebuild"));

const email = process.argv[2];
const handle = process.argv[3] || "e2eblog";
const POST_TITLE = "Hello from the e2e blog";

if (!email) {
  console.error("usage: node seed-blog.js <owner-email> [handle]");
  process.exit(1);
}

(async () => {
  const user = await promisify(User.getByEmail)(email);
  if (!user) throw new Error("no user found for " + email);

  const blog = await new Promise((resolve, reject) => {
    Blog.create(user.uid, { handle }, (err, blog) => {
      if (err) return reject(new Error(err.handle || JSON.stringify(err)));
      resolve(blog);
    });
  });

  // New blogs default to the global "SITE:blog" template (models/blog/
  // defaults.js); make sure the global templates exist on disk first.
  await buildTemplates({ watch: false });

  const post =
    [
      "Title: " + POST_TITLE,
      "Date: 2020-01-01",
      "",
      "This blog is served through the containerised proxy in the e2e suite.",
    ].join("\n") + "\n";

  await fs.outputFile(localPath(blog.id, "/hello.txt"), post);
  await rebuild(blog.id, {});

  console.log(
    "SEED_BLOG_RESULT=" +
      JSON.stringify({
        host: handle + "." + config.host,
        title: POST_TITLE,
        blogID: blog.id,
      })
  );
  process.exit(0);
})().catch((err) => {
  console.error("seed-blog failed:", err);
  process.exit(1);
});
