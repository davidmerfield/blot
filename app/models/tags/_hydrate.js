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

  multi.del(popularityKey);

  for (const tag of allTags) {
    const tagKey = key.tag(blogID, tag);
    const sortedTagKey = key.sortedTag(blogID, tag);

    const entryIDs = await smembersAsync(tagKey);
    console.log(blogID, "getting entries for tag:", tag, "with IDs:", entryIDs);
    const entries = await getEntries(blogID, entryIDs);
    console.log(blogID, "got entries for tag:", tag, "entries:", entries);

    if (!entries || !entries.length) {
      console.log("", blogID, "no entries for tag:", tag, "removing tag");
      multi.del(sortedTagKey);
      multi.del(tagKey);
      multi.srem(allTagsKey, tag);
      continue;
    }

    console.log(
      blogID,
      "hydrating sorted set for tag:",
      tag,
      "with entries:",
      entries.length
    );

    multi.del(sortedTagKey);

    for (const entry of entries) {
      let score = entry.dateStamp;
      if (typeof score !== "number" || isNaN(score)) {
        score = Date.now();
      }
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

  // verify the count of the popularity sorted set matches the number of tags
  const popularityCount = await new Promise((resolve, reject) => {
    client.zcard(popularityKey, (err, result) => {
      if (err) return reject(err);
      resolve(result || 0);
    });
  });

  const allTagsCount = await new Promise((resolve, reject) => {
    client.scard(allTagsKey, (err, result) => {
      if (err) return reject(err);
      resolve(result || 0);
    });
  });

  if (popularityCount !== allTagsCount) {
    const membersOfSortedSet = await new Promise((resolve, reject) => {
      client.zrange(popularityKey, 0, -1, (err, result) => {
        if (err) return reject(err);
        resolve(result || []);
      });
    });

    const membersOfSet = await new Promise((resolve, reject) => {
      client.smembers(key.all(blogID), (err, result) => {
        if (err) return reject(err);
        resolve(result || []);
      });
    });

    console.log(
      blogID,
      "members of popularity sorted set which are not in all tags set:",
      membersOfSortedSet.filter((tag) => !membersOfSet.includes(tag))
    );

    console.log(
      blogID,
      "members of all tags set which are not in popularity sorted set:",
      membersOfSet.filter((tag) => !membersOfSortedSet.includes(tag))
    );

    throw new Error(
      `Hydration failed: popularity sorted set count (${popularityCount}) does not match number of tags (${allTags.length})`
    );
  }
}

module.exports = hydrate;
