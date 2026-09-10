// One-off repair for template records whose stored slug no longer resolves to
// the template's id through makeID.
//
// writeToFolder names a locally edited template's on-disk directory after its
// stored slug, and readFromFolder turns that directory name back into an id
// with makeID. When the two disagree, a template written to a folder is read
// back as a *different* template and overwrites it. New templates are kept
// consistent in models/template/create.js (and the slugForName helper); this
// is the pass for records created before that fix — duplicated / forked /
// added-from-shared templates with long names, mostly.
//
//   node scripts/template/fix-divergent-slugs.js                 dry run, every blog
//   node scripts/template/fix-divergent-slugs.js <blog>          dry run, one blog
//   node scripts/template/fix-divergent-slugs.js --apply         apply, every blog
//   node scripts/template/fix-divergent-slugs.js --apply <blog>  apply, one blog
//
// <blog> is anything scripts/get/blog accepts (id, handle, domain, id prefix).
//
// The per-blog repair runs inside establishSyncLock(blog.id) so no
// buildFromFolder can run against a half-migrated state. The corrected slug is
// persisted only after the folder is durable under the new name, so a failed
// run leaves the record untouched and a rerun retries it identically. The
// actual reconciliation lives in models/template/util/repairDivergentSlug.js.

var getTemplateList = require("models/template/getTemplateList");
var establishSyncLock = require("sync/establishSyncLock");
var repairDivergentSlug = require("models/template/util/repairDivergentSlug");

var APPLY = process.argv.indexOf("--apply") > -1;
var IDENTIFIER = process.argv.slice(2).filter(function (a) {
  return a !== "--apply";
})[0];

var totals = {
  blogs: 0,
  templates: 0,
  divergent: 0,
  repaired: 0,
  skipped: 0,
  collisions: 0,
};

function getList(blogID) {
  return new Promise(function (resolve, reject) {
    getTemplateList(blogID, function (err, list) {
      if (err) return reject(err);
      resolve(list || []);
    });
  });
}

async function processBlog(blog) {
  var list;

  try {
    list = await getList(blog.id);
  } catch (e) {
    console.error("  " + blog.id + ": getTemplateList failed: " + e.message);
    return;
  }

  var owned = list.filter(function (t) {
    return t.owner === blog.id;
  });

  // Classify first (no filesystem writes) so the sync lock is only taken when
  // there is at least one divergent record to repair.
  var pending = [];
  owned.forEach(function (t) {
    totals.templates++;
    var info = repairDivergentSlug.classify(blog.id, t);
    if (!info.divergent) return;
    totals.divergent++;
    pending.push(t);
  });

  if (!pending.length) return;

  var per = { divergent: pending.length, repaired: 0, skipped: 0, collisions: 0 };

  var syncLock = null;
  if (APPLY) {
    try {
      syncLock = await establishSyncLock(blog.id);
    } catch (e) {
      console.error(
        "  " + blog.id + ": could not acquire sync lock: " + e.message +
        " (skipping this blog)"
      );
      per.skipped += pending.length;
      totals.skipped += pending.length;
      return;
    }
  }

  try {
    for (var i = 0; i < pending.length; i++) {
      var template = pending[i];
      var result;

      try {
        result = await repairDivergentSlug(blog, template, {
          apply: APPLY,
          log: function (line) {
            console.log("  " + line);
          },
        });
      } catch (e) {
        per.skipped++;
        totals.skipped++;
        console.error(
          "  FAIL " + blog.id + " " + template.id + ": " + e.message +
          " (left for a rerun)"
        );
        continue;
      }

      // Count the would-repair before any early return: a repair that is
      // merely available in a dry run still shows up in the totals.
      if (result.repaired || result.wouldRepair) {
        per.repaired++;
        totals.repaired++;
      } else if (result.collision) {
        per.collisions++;
        totals.collisions++;
        console.log(
          "  COLLISION " + blog.id + " " + template.id + ": " + result.reason
        );
      } else {
        per.skipped++;
        totals.skipped++;
        console.log(
          "  SKIP " + blog.id + " " + template.id + ": " + result.reason
        );
      }
    }
  } finally {
    if (syncLock) {
      try {
        await syncLock.done();
      } catch (e) {
        console.error(
          "  " + blog.id + ": failed to release sync lock: " + e.message
        );
      }
    }
  }

  console.log(
    "  blog " + blog.id + " (" + (blog.handle || "no handle") + "): " +
    "divergent " + per.divergent +
    (APPLY ? "  repaired " : "  would repair ") + per.repaired +
    "  skipped " + per.skipped +
    "  collisions " + per.collisions
  );
}

function printGrandTotal() {
  console.log("\n" + "=".repeat(60));
  console.log(
    "blogs " + totals.blogs +
    "  templates " + totals.templates +
    "  divergent " + totals.divergent +
    (APPLY ? "  repaired " : "  would repair ") + totals.repaired +
    "  skipped " + totals.skipped +
    "  collisions " + totals.collisions
  );

  if (!APPLY && totals.divergent) {
    console.log("\nRe-run with --apply to make these changes.");
  }
}

if (require.main === module) {
  if (!APPLY) console.log("DRY RUN — no changes will be written.\n");

  var run;

  if (IDENTIFIER) {
    run = new Promise(function (resolve) {
      require("../get/blog")(IDENTIFIER, function (err, user, blog) {
        if (err || !blog) {
          console.error(
            "No blog for " + JSON.stringify(IDENTIFIER) + ": " +
            ((err && err.message) || "not found")
          );
          return resolve();
        }
        totals.blogs = 1;
        processBlog(blog).then(resolve, function (e) {
          console.error("Fatal: " + e.message);
          resolve();
        });
      });
    });
  } else {
    run = new Promise(function (resolve) {
      require("../each/blog")(
        function (user, blog, nextBlog) {
          totals.blogs++;
          processBlog(blog).then(
            function () {
              nextBlog();
            },
            function (e) {
              console.error("  " + blog.id + ": " + e.message);
              nextBlog();
            }
          );
        },
        function () {
          resolve();
        }
      );
    });
  }

  run.then(function () {
    printGrandTotal();
    process.exit(0);
  });
}

module.exports = { processBlog: processBlog };
