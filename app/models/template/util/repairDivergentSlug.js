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

// A blot-folder-relative path for a client call. Always leading-slashed:
// git and dropbox strip the slash themselves, but google-drive's write adds
// one (so its file-id database is keyed with it) while its remove does not —
// pass the slashed form so removals actually match. See clients/google-drive.
function clientPath() {
  var parts = Array.prototype.slice.call(arguments).filter(Boolean);
  return "/" + parts.join("/");
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

// List every regular file under absDir (relative, "/"-joined). Directories
// themselves are skipped; dotfiles and shouldIgnoreFile-ignored local-only
// files are kept so the move is lossless. Symlinks are handled separately
// (containsSymlink) — a tree with one is refused rather than silently losing
// it, so they never reach here.
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

// True if any entry anywhere under absDir is a symlink. writeToFolder leaves
// symlinks out of reconciliation without deleting them; this migration deletes
// the whole source directory through the client, so a tracked symlink would be
// lost. Refuse such a directory instead.
function containsSymlink(absDir) {
  var found = false;

  (function walk(dir) {
    if (found) return;
    var entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "ENOTDIR") return;
      throw e;
    }
    for (var i = 0; i < entries.length; i++) {
      if (found) return;
      var entry = entries[i];
      if (entry.isSymbolicLink()) {
        found = true;
        return;
      }
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  })(absDir);

  return found;
}

// Copy each file from srcAbs/<rel> to <destRelClient>/<rel>. Real template
// files go through the blog's client so the move propagates to the provider;
// ignored local-only files (which client.write refuses) are written straight
// to disk.
async function copyFiles(blogID, client, files, srcAbs, destRelClient) {
  for (var i = 0; i < files.length; i++) {
    var rel = files[i];
    var destFileRel = destRelClient + "/" + rel;
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
async function removeDir(blogID, client, oldRelClient, oldAbs) {
  if (client) {
    try {
      await promisify(client.remove)(blogID, oldRelClient);
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
// rerun retries it identically rather than skipping it. If the metadata write
// fails after the folder was moved, the move is rolled back first so the
// buildFromFolder that syncLock.done() runs does not see a folder whose name
// no longer matches the still-stored slug (and drop the template).
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

  var list = await promisify(getTemplateList)(blog.id);
  var owned = (list || []).filter(function (t) {
    return t.owner === blog.id;
  });

  // If the stale slug resolves (via makeID) to a *different* real template, or
  // another owned record stores the *same* stale slug (so both claim the same
  // physical directory), leave every record involved for manual handling.
  var staleID = makeID(blog.id, oldSlug);
  var collidesWith = owned.find(function (t) {
    return (
      t.id !== template.id && (t.id === staleID || t.slug === oldSlug)
    );
  });
  if (collidesWith) {
    return {
      skipped: true,
      collision: true,
      reason:
        "stale slug " + JSON.stringify(oldSlug) + " is also claimed by " +
        collidesWith.id + " — resolve by hand",
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

  // A tracked symlink would be dropped by the copy and then committed as a
  // deletion by removeDir — refuse the directory rather than lose it.
  for (var s = 0; s < found.length; s++) {
    if (containsSymlink(found[s].oldAbs)) {
      return {
        skipped: true,
        reason:
          found[s].root + "/" + oldSlug +
          " contains a symlink — reconcile by hand",
      };
    }
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

  // Move every stale directory, then persist the slug. If anything in this
  // sequence fails, roll the moves back so a rerun retries identically and the
  // lock's buildFromFolder never sees folder/metadata disagreement.
  var moved = [];

  try {
    for (var f = 0; f < found.length; f++) {
      var fromRoot = found[f].root;
      var fromAbs = found[f].oldAbs;
      var oldRelClient = clientPath(fromRoot, oldSlug);
      var newRelClient = clientPath(fromRoot, target);
      var newAbs = safeDir(blog.id, fromRoot, target);

      if (newAbs === null) {
        throw new Error(
          "refusing to move " + oldRelClient + " into unsafe path " +
          newRelClient
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
        log("  " + newRelClient + " already present — resuming a prior move");
      }

      // Record the move before starting it so a mid-copy failure is rolled
      // back too (copying the partial destination back over the intact
      // source is a harmless overwrite).
      moved.push({
        oldRelClient: oldRelClient,
        oldAbs: fromAbs,
        newRelClient: newRelClient,
        newAbs: newAbs,
      });

      var files = walkFiles(fromAbs);
      await copyFiles(blog.id, client, files, fromAbs, newRelClient);
      await removeDir(blog.id, client, oldRelClient, fromAbs);
    }

    // The folder is durable under the new name (or there was no folder) — only
    // now correct the stored slug.
    await promisify(setMetadata)(template.id, { slug: target });
  } catch (e) {
    for (var m = moved.length - 1; m >= 0; m--) {
      var mv = moved[m];
      try {
        var backFiles = walkFiles(mv.newAbs);
        await copyFiles(blog.id, client, backFiles, mv.newAbs, mv.oldRelClient);
        await removeDir(blog.id, client, mv.newRelClient, mv.newAbs);
      } catch (rollbackErr) {
        log(
          "  ROLLBACK FAILED " + mv.newRelClient + " -> " + mv.oldRelClient +
          ": " + rollbackErr.message + " — reconcile by hand"
        );
      }
    }
    throw e;
  }

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
