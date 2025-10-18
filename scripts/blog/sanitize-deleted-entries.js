/**
 * Removes database residue for entries marked as deleted.
 *
 * Usage:
 *   node scripts/blog/sanitize-deleted-entries.js --o <blogId>
 */

const colors = require("colors/safe");
const minimist = require("minimist");
const eachEntry = require("../each/entry");
const Entry = require("models/entry");

const options = minimist(process.argv.slice(2));

let total = 0;
let sanitized = 0;
let errors = 0;

eachEntry(
  function (user, blog, entry, next) {
    if (!entry.deleted) return next();

    total += 1;

    Entry.drop(blog.id, entry.path, function (err) {
      if (err) {
        errors += 1;
        console.error(
          colors.red(
            `Failed to drop deleted entry ${blog.id} ${entry.path}: ${err.message || err}`
          )
        );
      } else {
        sanitized += 1;
        console.log(
          colors.green(`Dropped deleted entry ${blog.id} ${entry.path}`)
        );
      }

      next();
    });
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
