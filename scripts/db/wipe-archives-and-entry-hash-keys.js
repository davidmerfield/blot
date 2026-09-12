// Wipes the Redis keys left behind by the reverted archives-index and
// entry-hash-read rollout (see PR reverting 911cbff89, de64e4029, 0955e6537,
// 34763e6f2).
//
// Deletes two key families:
//   blog:*:archives:*      - archives index (buckets, months, entry->bucket,
//                            ready flag, generation counter). Nothing reads
//                            or writes these any more; safe to delete outright.
//   blog:*:entry:hash:*    - Redis-hash mirror of each entry, dual-written by
//                            app/models/entry/set.js (from earlier PRs #1758/
//                            #1771, NOT reverted here). Deleting these is safe
//                            because models/entry/get.js falls back to the
//                            JSON string key, but set.js will simply recreate
//                            a hash the next time that entry is saved - this
//                            only clears out what has accumulated so far, it
//                            does not stop the dual-write.
//
// Usage:
//   node scripts/db/wipe-archives-and-entry-hash-keys.js            # prompts before deleting
//   node scripts/db/wipe-archives-and-entry-hash-keys.js --dry-run  # count only, no prompt, no deletes
//   node scripts/db/wipe-archives-and-entry-hash-keys.js --yes      # skip the confirmation prompt

const colors = require("colors/safe");
const client = require("models/client");
const redisKeys = require("../util/redisKeys");
const getConfirmation = require("../util/getConfirmation");

const PATTERNS = ["blog:*:archives:*", "blog:*:entry:hash:*"];
const DELETE_BATCH_SIZE = 500;

async function collectKeys(pattern) {
  const keys = [];
  await redisKeys(pattern, async (key) => {
    keys.push(key);
  });
  return keys;
}

async function deleteKeys(keys) {
  let totalDeleted = 0;

  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const batch = keys.slice(i, i + DELETE_BATCH_SIZE);

    const batchDeleted = await new Promise((resolve, reject) => {
      const multi = client.multi();
      batch.forEach((key) => multi.del(key));
      multi
        .exec()
        .then((results) => {
          const deleted = Array.isArray(results)
            ? results.reduce(
                (sum, value) => sum + (typeof value === "number" ? value : 0),
                0
              )
            : 0;
          resolve(deleted);
        })
        .catch(reject);
    });

    totalDeleted += batchDeleted;
  }

  return totalDeleted;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const skipConfirmation = args.includes("--yes");

  const keysByPattern = new Map();

  for (const pattern of PATTERNS) {
    const keys = await collectKeys(pattern);
    keysByPattern.set(pattern, keys);
    console.log(
      colors.cyan(`${pattern}: found ${keys.length} key${keys.length === 1 ? "" : "s"}`)
    );
  }

  const allKeys = Array.from(keysByPattern.values()).flat();

  if (!allKeys.length) {
    console.log(colors.green("No matching keys found. Nothing to do."));
    return;
  }

  if (dryRun) {
    console.log(
      colors.yellow(`Dry run: would delete ${allKeys.length} key${allKeys.length === 1 ? "" : "s"} total.`)
    );
    return;
  }

  if (!skipConfirmation) {
    const confirmed = await getConfirmation(
      `Delete ${allKeys.length} key${allKeys.length === 1 ? "" : "s"} across ${PATTERNS.length} pattern(s)?`
    );

    if (!confirmed) {
      console.log(colors.yellow("Aborted without deleting any keys."));
      return;
    }
  }

  const totalDeleted = await deleteKeys(allKeys);

  console.log(
    colors.green(
      `Deleted ${allKeys.length} key${allKeys.length === 1 ? "" : "s"}. Redis removed ${totalDeleted} key${totalDeleted === 1 ? "" : "s"}.`
    )
  );
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(colors.red("Error:", error.message));
      process.exit(1);
    });
}

module.exports = main;
