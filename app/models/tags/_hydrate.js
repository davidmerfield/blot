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

  const allTagsKey = key.all(blogID);
  const allTags = await smembersAsync(allTagsKey);

  console.log(blogID, "found tags to hydrate:", allTags);

  const multi = client.multi();
  const popularityKey = key.popular(blogID);
  const hydrationToken = [
    "hydrate",
    Date.now(),
    process.pid,
    Math.random().toString(36).slice(2),
  ].join(":");
  const tempPopularityKey = `${popularityKey}:${hydrationToken}`;
  const placeholderMember = "__hydrating_placeholder__";

  multi.zadd(tempPopularityKey, 0, placeholderMember);

  for (const tag of allTags) {
    const tagKey = key.tag(blogID, tag);
    const sortedTagKey = key.sortedTag(blogID, tag);
    const tempSortedTagKey = `${sortedTagKey}:${hydrationToken}`;

    const entryIDs = await smembersAsync(tagKey);
    console.log(blogID, "getting entries for tag:", tag, "with IDs:", entryIDs);
    const entries = await getEntries(blogID, entryIDs);
    console.log(blogID, "got entries for tag:", tag, "entries:", entries);

    if (!entries || !entries.length) {
      multi.del(sortedTagKey);
      multi.del(tagKey);
      multi.srem(allTagsKey, tag);
      continue;
    }

    multi.zadd(tempSortedTagKey, 0, placeholderMember);

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
      multi.zadd(tempSortedTagKey, score, entry.id);
    }

    multi.rename(tempSortedTagKey, sortedTagKey);
    multi.zrem(sortedTagKey, placeholderMember);

    multi.zadd(tempPopularityKey, entryIDs.length, tag);
  }

  multi.rename(tempPopularityKey, popularityKey);
  multi.zrem(popularityKey, placeholderMember);
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
