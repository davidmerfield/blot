// One-off repair for template records whose stored slug no longer resolves to
// the template's id through makeID.
//
// writeToFolder names a locally edited template's on-disk directory after its
// stored slug, and readFromFolder turns that directory name back into an id
// with makeID. If the two disagree, a template written to a folder is read
// back as a different template and overwrites it. New templates are kept
// consistent in models/template/create.js; this is the pass for records
// created before that fix (duplicated / forked / shared templates with long
// names, mostly).
//
//   node scripts/template/fix-divergent-slugs.js                 dry run, every blog
//   node scripts/template/fix-divergent-slugs.js <blog>          dry run, one blog
//   node scripts/template/fix-divergent-slugs.js --apply         apply, every blog
//   node scripts/template/fix-divergent-slugs.js --apply <blog>  apply, one blog
//
// <blog> is anything scripts/get/blog accepts (id, handle, domain, id prefix).

var async = require("async");
var fs = require("fs-extra");
var join = require("path").join;

var Blog = require("models/blog");
var Template = require("models/template");
var makeID = require("models/template/util/makeID");
var determineTemplateFolder = require("models/template/determineTemplateFolder");
var localPath = require("helper/localPath");
var clients = require("clients");

var APPLY = process.argv.indexOf("--apply") > -1;
var IDENTIFIER = process.argv.slice(2).filter(function (a) {
  return a !== "--apply";
})[0];

var stats = { blogs: 0, templates: 0, divergent: 0, repaired: 0, skipped: 0 };

function idSuffix(id) {
  return id.split(":").slice(1).join(":");
}

// The slug we want is the id's own suffix — but only when makeID maps it back
// to the id. A legacy id minted from a non-ASCII name may not round-trip; that
// cannot be repaired safely here, so it is reported and left alone.
function repairSlugFor(blogID, template) {
  var target = idSuffix(template.id);
  if (!target) return null;
  if (makeID(blogID, target) !== template.id) return null;
  return target;
}

function processBlog(blog, done) {
  Template.getTemplateList(blog.id, function (err, templates) {
    if (err) {
      console.error(
        "  " + blog.id + " (" + blog.handle + "): getTemplateList failed:",
        err.message
      );
      return done();
    }

    var owned = (templates || []).filter(function (t) {
      return t.owner === blog.id;
    });

    async.eachSeries(
      owned,
      function (template, next) {
        stats.templates++;

        if (makeID(blog.id, template.slug) === template.id) return next();

        stats.divergent++;

        var target = repairSlugFor(blog.id, template);
        var tag = blog.id + " (" + blog.handle + ") " + template.id;

        if (!target) {
          stats.skipped++;
          console.log(
            "  SKIP  " +
              tag +
              "\n        slug " +
              JSON.stringify(template.slug) +
              " diverges, but the id has no round-tripping suffix — rename the template by hand"
          );
          return next();
        }

        console.log(
          "  " +
            (APPLY ? "FIX " : "WOULD FIX") +
            " " +
            tag +
            "\n        slug " +
            JSON.stringify(template.slug) +
            " -> " +
            JSON.stringify(target) +
            "  (localEditing=" +
            !!template.localEditing +
            ")"
        );

        if (!APPLY) return next();

        repair(blog, template, target, function (repairErr) {
          if (repairErr) {
            console.error("        failed:", repairErr.message);
          } else {
            stats.repaired++;
          }
          next();
        });
      },
      done
    );
  });
}

function repair(blog, template, target, callback) {
  var staleSlug = template.slug;

  Template.setMetadata(template.id, { slug: target }, function (err) {
    if (err) return callback(err);

    Blog.set(blog.id, { cacheID: Date.now() }, function () {
      if (!template.localEditing) return callback();

      // Rewrite the template into the folder under the corrected slug. Note
      // this regenerates package.json and the stored views; any local-only
      // files under the stale directory are not carried across.
      Template.writeToFolder(blog.id, template.id, function (writeErr) {
        if (writeErr) return callback(writeErr);
        removeStaleDir(blog, template, staleSlug, target, callback);
      });
    });
  });
}

function removeStaleDir(blog, template, staleSlug, target, callback) {
  if (!staleSlug || staleSlug === target) return callback();

  // If the stale name resolves to a different real template, that template may
  // own the directory — leave it.
  Template.getTemplateList(blog.id, function (err, templates) {
    if (err) return callback(err);

    var staleID = makeID(blog.id, staleSlug);
    var ownedByOther = (templates || []).some(function (t) {
      return t.id === staleID && t.id !== template.id;
    });

    if (ownedByOther) {
      console.log(
        "        left " +
          JSON.stringify(staleSlug) +
          " directory in place: it resolves to " +
          staleID
      );
      return callback();
    }

    determineTemplateFolder(blog.id, function (folderErr, folderName) {
      if (folderErr) return callback(folderErr);

      var stalePath = join(folderName, staleSlug);
      var client = clients[blog.client];

      var removeLocal = function () {
        fs.remove(localPath(blog.id, stalePath), function () {
          callback();
        });
      };

      if (!blog.client || !client) return removeLocal();

      client.remove(blog.id, stalePath, function (removeErr) {
        if (removeErr && removeErr.code !== "ENOENT") {
          console.error(
            "        client.remove(" + stalePath + ") failed:",
            removeErr.message
          );
        }
        removeLocal();
      });
    });
  });
}

function finish(err) {
  if (err) console.error("Fatal:", err.message || err);

  console.log(
    "\nblogs " +
      stats.blogs +
      "  templates " +
      stats.templates +
      "  divergent " +
      stats.divergent +
      "  " +
      (APPLY ? "repaired " : "would repair ") +
      stats.repaired +
      "  skipped " +
      stats.skipped
  );

  if (!APPLY && stats.divergent) {
    console.log("\nRe-run with --apply to make these changes.");
  }

  process.exit(err ? 1 : 0);
}

if (require.main === module) {
  if (!APPLY) console.log("DRY RUN — no changes will be written.\n");

  if (IDENTIFIER) {
    require("../get/blog")(IDENTIFIER, function (err, user, blog) {
      if (err || !blog) {
        return finish(err || new Error("No blog: " + IDENTIFIER));
      }
      stats.blogs = 1;
      processBlog(blog, function () {
        finish();
      });
    });
  } else {
    require("../each/blog")(
      function (user, blog, nextBlog) {
        stats.blogs++;
        processBlog(blog, nextBlog);
      },
      function (err) {
        finish(err);
      }
    );
  }
}

module.exports = { processBlog: processBlog, repairSlugFor: repairSlugFor };
