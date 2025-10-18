const client = require("models/client");
const ensure = require("helper/ensure");
const key = require("./key");
const { promisify } = require("util");

async function hydrate(blogID) {

  try {
    await verifyHydration(blogID);
    console.log(blogID, "hydration verification passed, no need to hydrate");
    return;
  } catch (e) {
    console.log(blogID, "hydration verification failed, proceeding to hydrate:", e);
  }

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
    const entries = await getEntries(blogID, entryIDs);

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

  await verifyHydration(blogID);
}

async function verifyHydration(blogID) {
  const popularityKey = key.popular(blogID);
  const allTagsKey = key.all(blogID);

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
      client.smembers(allTagsKey, (err, result) => {
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
      `Hydration failed: popularity sorted set count (${popularityCount}) does not match all tags set count (${allTagsCount})`
    );
  }

  // for each tag, verify that there is a sorted set of the entries with the same number of members
  // as the tag set
  const allTags = await new Promise((resolve, reject) => {
    client.smembers(allTagsKey, (err, result) => {
      if (err) return reject(err);
      resolve(result || []);
    });
  });

  for (const tag of allTags) {
    const sortedTagKey = key.sortedTag(blogID, tag);
    const tagKey = key.tag(blogID, tag);

    const sortedSetCount = await new Promise((resolve, reject) => {
      client.zcard(sortedTagKey, (err, result) => {
        if (err) return reject(err);
        resolve(result || 0);
      });
    });

    const tagSetCount = await new Promise((resolve, reject) => {
      client.scard(tagKey, (err, result) => {
        if (err) return reject(err);
        resolve(result || 0);
      });
    });

    if (sortedSetCount !== tagSetCount) {
      throw new Error(
        `Hydration failed for tag "${tag}": sorted set count (${sortedSetCount}) does not match tag set count (${tagSetCount})`
      );
    }
  }
}

module.exports = hydrate;
