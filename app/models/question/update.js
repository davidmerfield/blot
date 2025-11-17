const client = require("models/client");
const keys = require("./keys");
const get = require("./get");

module.exports = async (id, updates) => {
  const existing = await get(id);

  if (!existing) throw new Error("Question with ID " + id + " does not exist");

  const multi = client.multi();
  const created_at =
    existing.created_at || updates.created_at || Date.now().toString();
  const removedTags = [];

  for (const key in updates) {
    let value = updates[key];

    if (typeof value === "object" || Array.isArray(value)) {
      value = JSON.stringify(value);
    } else if (typeof value === "boolean") {
      value = value ? "true" : "false";
    } else if (typeof value === "number") {
      value = value.toString();
    }

    multi.hset(keys.item(id), key, value);
  }

  // we need to update any tags
  if (updates.tags) {
    for (const tag of updates.tags) {
      multi.sadd(keys.all_tags, tag);
      multi.zadd(keys.by_tag(tag),  parseInt(created_at), id);
    }

    for (const tag of existing.tags) {
      if (!updates.tags.includes(tag)) {
        multi.zrem(keys.by_tag(tag), id);
        removedTags.push(tag);
      }
    }
  }

  const tagsToRemove = await identifyTagsToRemove(removedTags);

  for (const tag of tagsToRemove) {
    multi.srem(keys.all_tags, tag);
  }

  return new Promise((resolve, reject) => {
    multi.exec((err) => {
      if (err) {
        reject(err);
      }
      // get the latest version of the question
      // and return it
      get(id).then(resolve).catch(reject);
    });
  });
};

// clean up any tags that are no longer used
function identifyTagsToRemove(removedTags) {
  const batch = client.batch();
  const tagsToRemove = [];

  for (const tag of removedTags) {
    batch.zcard(keys.by_tag(tag));
  }

  return new Promise((resolve, reject) => {
    batch.exec(async (err, replies) => {
      if (err) {
        reject(err);
      }

      for (let i = 0; i < replies.length; i++) {
        if (replies[i] <= 1) {
          tagsToRemove.push(removedTags[i]);
        }
      }

      resolve(tagsToRemove);
    });
  });
}
