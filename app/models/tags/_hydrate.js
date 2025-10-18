const client = require("models/client");
const ensure = require("helper/ensure");
const key = require("./key");
const { promisify } = require("util");

async function hydrate(blogID) {
  const smembersAsync = promisify(client.smembers).bind(client);

  const getEntries = (blogID, entryIDs) => {
    return new Promise((resolve, reject) => {
      require("models/entry").get(blogID, entryIDs, (entries) => {
        resolve(entries);
      });
    });
  };

  ensure(blogID, "string");

  console.log(blogID, "hydrating tags sorted sets");

  const allTags = await smembersAsync(key.all(blogID));

  console.log(blogID, "found tags to hydrate:", allTags);

  const multi = client.multi();
  const popularityKey = key.popular(blogID);

  multi.del(popularityKey);

  for (const tag of allTags) {
    const tagKey = key.tag(blogID, tag);
    const sortedTagKey = key.sortedTag(blogID, tag);

    const entryIDs = await smembersAsync(tagKey);
    console.log(blogID, "getting entries for tag:", tag, "with IDs:", entryIDs);
    const entries = await getEntries(blogID, entryIDs);
    console.log(blogID, "got entries for tag:", tag, "entries:", entries);

    for (const entry of entries) {
      let score = entry.dateStamp;
      if (typeof score !== "number" || isNaN(score)) {
        score = Date.now();
      }
      console.log(
        blogID,
        "adding to sorted set:",
        sortedTagKey,
        "entry ID:",
        entry.id,
        "score:",
        score
      );
      multi.zadd(sortedTagKey, score, entry.id);
    }

    multi.zadd(popularityKey, entryIDs.length, tag);
  }

  multi.zremrangebyscore(popularityKey, "-inf", 0);
  
  await new Promise((resolve, reject) => {
    multi.exec((err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

  console.log(blogID, "finished hydrating tags sorted sets");
}

module.exports = hydrate;