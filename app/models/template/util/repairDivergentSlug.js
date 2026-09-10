var path = require("path");
var fs = require("fs-extra");
var { promisify } = require("util");

var makeID = require("./makeID");
var localPath = require("helper/localPath");
var setMetadata = require("../setMetadata");
var getTemplateList = require("../getTemplateList");
var Blog = require("models/blog");
var shouldIgnoreFile = require("clients/util/shouldIgnoreFile");

// buildFromFolder scans both of these; writeToFolder writes to whichever
// determineTemplateFolder picks. A stale directory could be under either.
var TEMPLATE_ROOTS = ["Templates", "templates"];

function idSuffix(id) {
  var i = String(id).indexOf(":");
  return i === -1 ? "" : String(id).slice(i + 1);
}

// A slug is safe to use as a single on-disk path component only if it has no
// separators and does not climb out of its directory.
function isSafeComponent(slug) {
  return (
    typeof slug === "string" &&
    slug.length > 0 &&
    slug !== "." &&
    slug !== ".." &&
    slug.indexOf("/") === -1 &&
    slug.indexOf("\\") === -1
  );
}

// Resolve <root>/<slug> and confirm it lands directly inside <root> of the
// blog's folder. Returns the absolute path, or null when the slug is unsafe.
function safeDir(blogID, root, slug) {
  if (!isSafeComponent(slug)) return null;
  var rootAbs = localPath(blogID, root);
  var abs = localPath(blogID, path.join(root, slug));
  if (path.dirname(abs) !== rootAbs) return null;
  return abs;
}

// Pure classification of a template's stored slug against its id.
//   { divergent: false }
//   { divergent: true, repairable: false, reason }   -> needs a manual rename
//   { divergent: true, repairable: true, target }    -> target is the new slug
function classify(blogID, template) {
  var slug = template && template.slug;
  var resolved;

  try {
    resolved = makeID(blogID, slug);
  } catch (e) {
    return {
      divergent: true,
      repairable: false,
      reason:
        "stored slug " + JSON.stringify(slug) + " is not a usable name (" +
        e.message + ")",
    };
  }

  if (resolved === template.id) return { divergent: false };

  // The slug we want is the id's own suffix — but only when makeID maps it
  // straight back to the id. A legacy id minted from a non-ASCII name (before
  // makeID capped length / percent-encoded it) will not round-trip and cannot
  // be repaired safely here.
  var target = idSuffix(template.id);

  if (!target || makeID(blogID, target) !== template.id) {
    return {
      divergent: true,
      repairable: false,
      reason:
        "id " + template.id + " has no suffix that makeID maps back to it — " +
        "rename the template by hand",
    };
  }

  return { divergent: true, repairable: true, target: target };
}

// List every regular file under absDir (relative, "/"-joined). Symlinks and
// directories themselves are skipped; dotfiles and shouldIgnoreFile-ignored
// local-only files are kept so the move is lossless.
function walkFiles(absDir) {
  var out = [];

  (function walk(dir, rel) {
    var entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "ENOTDIR") return;
      throw e;
    }

    entries.forEach(function (entry) {
      var childRel = rel ? rel + "/" + entry.name : entry.name;
      if (entry.isSymbolicLink()) return;
      if (entry.isDirectory()) return walk(path.join(dir, entry.name), childRel);
      if (entry.isFile()) out.push(childRel);
    });
  })(absDir, "");

  return out;
}

// Copy each file from srcAbs/<rel> to <destRel>/<rel>. Real template files go
// through the blog's client so the move propagates to the provider; ignored
// local-only files (which client.write refuses) are written straight to disk.
async function copyFiles(blogID, client, files, srcAbs, destRel) {
  for (var i = 0; i < files.length; i++) {
    var rel = files[i];
    var destFileRel = path.join(destRel, rel);
    var contents = await fs.readFile(path.join(srcAbs, rel));

    if (!client || shouldIgnoreFile(destFileRel)) {
      await fs.outputFile(localPath(blogID, destFileRel), contents);
    } else {
      await promisify(client.write)(blogID, destFileRel, contents);
    }
  }
}

// Remove the stale directory: through the client first (so the provider drops
// the tracked files), then a plain fs.remove to sweep up any local-only
// leftovers and the now-empty directory shell.
async function removeDir(blogID, client, oldRel, oldAbs) {
  if (client) {
    try {
      await promisify(client.remove)(blogID, oldRel);
    } catch (e) {
      if (!e || e.code !== "ENOENT") throw e;
    }
  }
  await fs.remove(oldAbs);
}

// Reconcile one template whose stored slug no longer resolves to its id.
//
// The caller is responsible for holding establishSyncLock(blog.id) around this
// so no buildFromFolder runs against a half-migrated state.
//
// Returns one of:
//   { skipped: true, reason }              not divergent / manual rename / unsafe
//   { skipped: true, collision: true, reason }
//   { wouldRepair: true }                  dry run, a repair is available
//   { repaired: true }                     applied
//
// Throws on a folder / metadata error — the record is then left untouched so a
// rerun retries it identically rather than skipping it.
async function repairDivergentSlug(blog, template, options) {
  options = options || {};
  var apply = options.apply === true;
  var log = typeof options.log === "function" ? options.log : function () {};

  var info = classify(blog.id, template);

  if (!info.divergent) return { skipped: true, reason: "slug already resolves" };
  if (!info.repairable) return { skipped: true, reason: info.reason };

  var oldSlug = template.slug;
  var target = info.target;

  // Constrain the stale slug as a path component before any filesystem access.
  var unsafe = TEMPLATE_ROOTS.some(function (root) {
    return safeDir(blog.id, root, oldSlug) === null;
  });
  if (unsafe) {
    return {
      skipped: true,
      reason:
        "stored slug " + JSON.stringify(oldSlug) +
        " is not a safe path component",
    };
  }

  // If the stale slug resolves (via makeID) to a *different* real template,
  // that template may own the directory — leave both for manual handling.
  var list = await promisify(getTemplateList)(blog.id);
  var staleID = makeID(blog.id, oldSlug);
  var collidesWith = (list || []).find(function (t) {
    return t.id === staleID && t.id !== template.id;
  });
  if (collidesWith) {
    return {
      skipped: true,
      collision: true,
      reason:
        "stale slug " + JSON.stringify(oldSlug) + " resolves to " + staleID +
        " (another template) — resolve by hand",
    };
  }

  // Find the stale directory under either root. A divergent record can have a
  // stale folder even with localEditing === false (the disable route sets the
  // flag even when removeFromFolder failed), so key off the actual directory,
  // not the flag.
  var client = require("clients")[blog.client] || null;
  var found = [];

  for (var r = 0; r < TEMPLATE_ROOTS.length; r++) {
    var root = TEMPLATE_ROOTS[r];
    var oldAbs = safeDir(blog.id, root, oldSlug);
    var stat = null;

    try {
      stat = await fs.lstat(oldAbs);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }

    if (stat && stat.isDirectory()) found.push({ root: root, oldAbs: oldAbs });
  }

  log(
    (apply ? "FIX  " : "WOULD FIX ") + blog.id + " " + template.id +
    "  " + JSON.stringify(oldSlug) + " -> " + JSON.stringify(target) +
    "  (localEditing=" + !!template.localEditing +
    ", onDisk=" +
    (found.length
      ? found
          .map(function (f) {
            return f.root;
          })
          .join("+")
      : "none") +
    ")"
  );

  if (!apply) return { wouldRepair: true };

  // Move every stale directory before persisting the slug: a failed folder
  // step must leave the stored slug untouched so a rerun retries identically.
  for (var f = 0; f < found.length; f++) {
    var fromRoot = found[f].root;
    var fromAbs = found[f].oldAbs;
    var oldRel = path.join(fromRoot, oldSlug);
    var newRel = path.join(fromRoot, target);
    var newAbs = safeDir(blog.id, fromRoot, target);

    if (newAbs === null) {
      throw new Error(
        "refusing to move " + oldRel + " into unsafe path " + newRel
      );
    }

    // No other template can legitimately own <root>/<target>: target is this
    // template's own id suffix. A directory already there is a leftover from
    // an interrupted run — overwrite it and continue.
    var destStat = null;
    try {
      destStat = await fs.lstat(newAbs);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (destStat) {
      log("  " + newRel + " already present — resuming an interrupted move");
    }

    var files = walkFiles(fromAbs);
    await copyFiles(blog.id, client, files, fromAbs, newRel);
    await removeDir(blog.id, client, oldRel, fromAbs);
  }

  // The folder is durable under the new name (or there was no folder) — only
  // now correct the stored slug.
  await promisify(setMetadata)(template.id, { slug: target });

  // setMetadata already bumps cacheID for a blog-owned template; do it
  // explicitly too so the repair is self-contained.
  try {
    await promisify(Blog.set)(blog.id, { cacheID: Date.now() });
  } catch (e) {
    // non-fatal: the slug and folder are already consistent
  }

  return { repaired: true };
}

module.exports = repairDivergentSlug;
module.exports.classify = classify;
module.exports.TEMPLATE_ROOTS = TEMPLATE_ROOTS;
