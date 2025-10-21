/**
 * Removes database residue for entries marked as deleted.
 *
 * Usage:
 *   node scripts/blog/sanitize-deleted-entries.js --o <blogId>
 */

const colors = require("colors/safe");
const minimist = require("minimist");
const eachBlog = require("../each/blog");
const Entries = require("models/entries");
const Blog = require("models/blog");
const Entry = require("models/entry");

const options = minimist(process.argv.slice(2));

let total = 0;
let sanitized = 0;
let errors = 0;

eachBlog(
  function (user, blog, nextBlog) {
    if (blog.flags && blog.flags.deleted_entries_sanitized) {
      return nextBlog();
    }

    Entries.each(
      blog.id,
      function (entry, nextEntry) {
        if (!entry.deleted) return nextEntry();

        total += 1;

        Entry.drop(blog.id, entry.path, function (err) {
          if (err) {
            errors += 1;
            console.error(
              colors.red(
                `Failed to drop deleted entry ${blog.id} ${entry.path}: ${
                  err.message || err
                }`
              )
            );
          } else {
            sanitized += 1;
            console.log(
              colors.green(`Dropped deleted entry ${blog.id} ${entry.path}`)
            );
          }

          nextEntry();
        });
      },
      function (err) {
        if (err) {
          errors += 1;
          console.error(
            colors.red(
              `Failed to iterate deleted entries for blog ${blog.id}: ${
                err.message || err
              }`
            )
          );
        }

        const existingFlags = blog.flags ? Object.assign({}, blog.flags) : {};
        const updatedFlags = Object.assign({}, existingFlags, {
          deleted_entries_sanitized: true,
        });

        Blog.set(
          blog.id,
          { flags: updatedFlags },
          function (setErr) {
            if (setErr) {
              errors += 1;
              console.error(
                colors.red(
                  `Failed to update flags for blog ${blog.id}: ${
                    setErr.message || setErr
                  }`
                )
              );
            }

            nextBlog();
          }
        );
      }
    );
  },
  function () {
    console.log(colors.cyan(`Processed ${total} deleted entries.`));
    console.log(colors.green(`Sanitized ${sanitized} entries.`));

    if (errors) {
      console.error(colors.red(`Encountered ${errors} errors.`));
      process.exit(1);
    } else {
      console.log(colors.green("Encountered 0 errors."));
      process.exit();
    }
  },
  options
);
