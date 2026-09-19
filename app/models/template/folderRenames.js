// A local template is identified by its folder name, so renaming the folder
// looks like one template disappearing and another appearing. Depending on
// the client the two halves can arrive in the same sync or in separate ones,
// so we persist just enough between syncs to pair them up again:
//
//   pending: local templates whose folder went missing, with a fingerprint of
//            their views. They're kept (not dropped) for RENAME_WINDOW.
//   fresh:   templates first created from a folder, with the time we saw them.
//
// A pending template and a fresh one with identical views are a rename.

var crypto = require("crypto");
var client = require("models/client");
var getAllViews = require("./getAllViews");

var RENAME_WINDOW = 2 * 60 * 1000; // 2 minutes

function pendingKey(blogID) {
  return "template:folder_pending_removal:" + blogID;
}

function freshKey(blogID) {
  return "template:folder_fresh:" + blogID;
}

function fingerprint(templateID) {
  return new Promise(function (resolve, reject) {
    getAllViews(templateID, function (err, views) {
      if (err) return reject(err);

      var names = Object.keys(views || {}).sort();

      // Nothing to compare an empty template on
      if (!names.length) return resolve(null);

      var hash = crypto.createHash("sha1");

      names.forEach(function (name) {
        hash.update(name + "\0" + (views[name].content || "") + "\0");
      });

      resolve(hash.digest("hex"));
    });
  });
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
  pendingKey: pendingKey,
  freshKey: freshKey,
  fingerprint: fingerprint,

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
