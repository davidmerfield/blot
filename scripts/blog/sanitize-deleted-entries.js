/**
 * Removes database residue for entries marked as deleted.
 *
 * Usage:
 *   node scripts/blog/sanitize-deleted-entries.js [blog-identifier]
 */

const colors = require("colors/safe");
const { promisify } = require("util");
const eachBlogOrOneBlog = require("../each/eachBlogOrOneBlog");
const Entries = require("models/entries");
const Blog = require("models/blog");
const Entry = require("models/entry");

const EntryDrop = promisify(Entry.drop);
const BlogSet = promisify(Blog.set);

let total = 0;
let sanitized = 0;
let errors = 0;

const processEntries = (blog) => {
  return new Promise((resolve, reject) => {
    let blogHadError = false;

    Entries.each(
      blog.id,
      function (entry, nextEntry) {
        if (!entry.deleted) return nextEntry();

        total += 1;

        EntryDrop(blog.id, entry.path)
          .then(() => {
            sanitized += 1;
            console.log(
              colors.green(`Dropped deleted entry ${blog.id} ${entry.path}`)
            );
            nextEntry();
          })
          .catch((err) => {
            errors += 1;
            blogHadError = true;
            console.error(
              colors.red(
                `Failed to drop deleted entry ${blog.id} ${entry.path}: ${
                  err.message || err
                }`
              )
            );
            nextEntry();
          });
      },
      function (err) {
        if (err) {
          errors += 1;
          blogHadError = true;
          console.error(
            colors.red(
              `Failed to iterate deleted entries for blog ${blog.id}: ${
                err.message || err
              }`
            )
          );
        }

        if (blogHadError) {
          console.log(
            colors.yellow(
              `Skipped updating flags for blog ${blog.id} due to errors.`
            )
          );
          return resolve();
        }

        const existingFlags = blog.flags ? Object.assign({}, blog.flags) : {};
        const updatedFlags = Object.assign({}, existingFlags, {
          deleted_entries_sanitized: true,
        });

        BlogSet(blog.id, { flags: updatedFlags, cacheID: Date.now() })
          .then(() => {
            resolve();
          })
          .catch((setErr) => {
            errors += 1;
            console.error(
              colors.red(
                `Failed to update flags for blog ${blog.id}: ${
                  setErr.message || setErr
                }`
              )
            );
            resolve();
          });
      }
    );
  });
};

const processBlog = async (blog) => {
  if (blog.flags && blog.flags.deleted_entries_sanitized) {
    return;
  }

  await processEntries(blog);
};

if (require.main === module) {
  eachBlogOrOneBlog(processBlog)
    .then(() => {
      console.log(colors.cyan(`Processed ${total} deleted entries.`));
      console.log(colors.green(`Sanitized ${sanitized} entries.`));

      if (errors) {
        console.error(colors.red(`Encountered ${errors} errors.`));
        process.exit(1);
      } else {
        console.log(colors.green("Encountered 0 errors."));
        process.exit(0);
      }
    })
    .catch((err) => {
      console.error(colors.red("Error:"), err);
      process.exit(1);
    });
}
