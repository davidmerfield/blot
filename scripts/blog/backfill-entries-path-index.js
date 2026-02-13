/**
 * Backfills Redis lexicographic entry path index for one blog or all blogs.
 *
 * Usage:
 *   node scripts/blog/backfill-entries-path-index.js [blog-identifier]
 *
 * When no identifier is provided, this script prompts for confirmation and
 * then processes every blog.
 */

const colors = require("colors/safe");
const { promisify } = require("util");
const eachBlogOrOneBlog = require("../each/eachBlogOrOneBlog");
const redis = require("models/client");
const pathIndex = require("models/entries/pathIndex");

const backfillIndex = promisify(pathIndex.backfillIndex);
const zcard = promisify(redis.zcard).bind(redis);

let processed = 0;
let skipped = 0;
let rebuilt = 0;
let rebuiltMembers = 0;
let errors = 0;

async function countsMatch(blogID) {
  const entriesCount = await zcard(`blog:${blogID}:entries`);
  const lexCount = await zcard(pathIndex.lexKey(blogID));

  return {
    matches: entriesCount === lexCount,
    entriesCount,
    lexCount,
  };
}

async function processBlog(blog) {
  processed += 1;

  try {
    const before = await countsMatch(blog.id);

    if (before.matches) {
      skipped += 1;
      console.log(
        colors.gray(
          `Skipping ${blog.id} (already backfilled: entries=${before.entriesCount}, lex=${before.lexCount})`
        )
      );
      return;
    }

    const members = await backfillIndex(blog.id);
    const after = await countsMatch(blog.id);

    if (!after.matches) {
      throw new Error(
        `post-backfill counts still differ (entries=${after.entriesCount}, lex=${after.lexCount})`
      );
    }

    rebuilt += 1;
    rebuiltMembers += members;

    console.log(
      colors.green(
        `Backfilled ${blog.id} (${members} indexed entr${members === 1 ? "y" : "ies"})`
      )
    );
  } catch (err) {
    errors += 1;
    console.error(
      colors.red(
        `Failed to backfill ${blog.id}: ${err && err.message ? err.message : err}`
      )
    );
  }
}

if (require.main === module) {
  eachBlogOrOneBlog(processBlog)
    .then(() => {
      console.log(colors.cyan(`Processed: ${processed}`));
      console.log(colors.gray(`Skipped: ${skipped}`));
      console.log(colors.green(`Rebuilt: ${rebuilt}`));
      console.log(colors.green(`Indexed members: ${rebuiltMembers}`));

      if (errors) {
        console.error(colors.red(`Errors: ${errors}`));
        process.exit(1);
      }

      console.log(colors.green("Errors: 0"));
      process.exit(0);
    })
    .catch((err) => {
      console.error(colors.red("Error:"), err);
      process.exit(1);
    });
}
