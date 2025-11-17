const client = require("models/client");
const keys = require("./keys");
const get = require("./get");

module.exports = async function ({
  id = "",
  parent = "",
  title = "",
  body = "",
  author = "",
  tags = [],
  created_at = Date.now().toString(),
}) {
  // If no id is provided, generate one
  if (!id) {
    id = await generateID();
  } else {
    const isUnique = await checkIDisUnique(id);
    if (!isUnique) throw new Error("Item with ID " + id + " already exists");
  }

  const item = {
    id,
    parent,
    author,
    title,
    body,
    tags: parent ? "[]" : JSON.stringify(tags),
    created_at,
  };

  // check all the properties of the item are strings
  Object.keys(item).forEach((key) => {
    if (typeof item[key] !== "string") {
      throw new Error("Item property " + key + " is not a string");
    }
  });

  const multi = client.multi();

  // Handle replies
  if (parent) {
    multi.zadd(keys.children(parent), parseInt(created_at), id);
    multi.zadd(keys.by_last_reply, parseInt(created_at), parent);
    multi.zincrby(keys.by_number_of_replies, 1, parent);

    // Handle questions
  } else {

    tags.forEach((tag) => {
      multi.sadd(keys.all_tags, tag);
      multi.zadd(keys.by_tag(tag),  parseInt(created_at), id);
    });

    multi.sadd(keys.all_questions, id);
    multi.zadd(keys.by_last_reply,  parseInt(created_at), id);
    multi.zadd(keys.by_created,  parseInt(created_at), id);
    multi.zadd(keys.by_number_of_replies, 0, id);
  }

  multi.hmset(keys.item(id), item);

  // ensure the multi command fails if the ID
  // is already in use
  multi.setnx(keys.item(id), id);

  return new Promise((resolve, reject) => {
    multi.exec((err) => {
      if (err) return reject(err);
      get(id).then(resolve).catch(reject);
    });
  });
};

function checkIDisUnique(id) {
  return new Promise((resolve, reject) => {
    client.exists(keys.item(id), (err, exists) => {
      if (err) return reject(err);
      resolve(!exists);
    });
  });
}

function generateID() {
  return new Promise((resolve, reject) => {
    client.incr(keys.next_id, (err, id) => {
      if (err) return reject(err);
      resolve(id.toString());
    });
  });
}
