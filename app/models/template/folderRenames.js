// A local template is identified by its folder name, so renaming the folder
// of the *installed* template looks like it disappearing and another template
// appearing, leaving the blog pointing at a template that no longer exists.
// Depending on the client the two halves can arrive in the same sync or in
// separate ones, so we persist just enough between syncs to pair them up:
//
//   pending: the installed template whose folder went missing, with the time
//            we noticed and its views. It's kept (not dropped) for
//            RENAME_WINDOW, during which the site keeps working.
//   fresh:   templates first created from a folder, with the time we saw them.
//
// Templates which aren't installed are simply dropped and re-created: nothing
// depends on them and everything they contain is in the folder.

var crypto = require("crypto");
var client = require("models/client");
var getAllViews = require("./getAllViews");

var RENAME_WINDOW = 10 * 60 * 1000; // 10 minutes
var MIN_SIMILARITY = 0.5;

function pendingKey(blogID) {
  return "template:folder_pending_removal:" + blogID;
}

function freshKey(blogID) {
  return "template:folder_fresh:" + blogID;
}

// Maps each view name to a hash of its content
function viewHashes(templateID) {
  return new Promise(function (resolve, reject) {
    getAllViews(templateID, function (err, views) {
      if (err) return reject(err);

      var hashes = {};

      Object.keys(views || {}).forEach(function (name) {
        hashes[name] = crypto
          .createHash("sha1")
          .update(views[name].content || "")
          .digest("hex");
      });

      resolve(hashes);
    });
  });
}

// How alike two templates are, from 0 to 1: the share of view names they have
// in common, so a renamed folder whose files were also edited still matches.
function similarity(a, b) {
  var names = Object.keys(a);
  var union = new Set(names.concat(Object.keys(b)));

  if (!union.size) return 0;

  var common = names.filter(function (name) {
    return Object.prototype.hasOwnProperty.call(b, name);
  });

  return common.length / union.size;
}

async function readAll(key) {
  var raw = (await client.hGetAll(key)) || {};
  var result = {};

  Object.keys(raw).forEach(function (field) {
    try {
      result[field] = JSON.parse(raw[field]);
    } catch (e) {
      // ignore unreadable records, they'll be overwritten or pruned
    }
  });

  return result;
}

module.exports = {
  RENAME_WINDOW: RENAME_WINDOW,
  MIN_SIMILARITY: MIN_SIMILARITY,
  pendingKey: pendingKey,
  freshKey: freshKey,
  viewHashes: viewHashes,
  similarity: similarity,

  markFresh: async function (blogID, templateID) {
    await client.hSet(freshKey(blogID), templateID, JSON.stringify(Date.now()));
    await client.expire(freshKey(blogID), Math.ceil((RENAME_WINDOW * 2) / 1000));
  },

  readFresh: function (blogID) {
    return readAll(freshKey(blogID));
  },

  readPending: function (blogID) {
    return readAll(pendingKey(blogID));
  },

  setPending: async function (blogID, templateID, record) {
    await client.hSet(pendingKey(blogID), templateID, JSON.stringify(record));
    await client.expire(pendingKey(blogID), Math.ceil((RENAME_WINDOW * 2) / 1000));
  },

  clear: async function (blogID, templateID) {
    await client.hDel(pendingKey(blogID), templateID);
    await client.hDel(freshKey(blogID), templateID);
  },
};
