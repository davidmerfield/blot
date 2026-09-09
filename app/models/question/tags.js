const client = require("models/client");
const keys = require("./keys");
const PAGE_SIZE = 10;

// returns tags, sorted by popularity
// paginated by PAGE_SIZE

module.exports = async ({ page = 1 } = {}) => {
  const tags = await client.sMembers(keys.all_tags);

  const counts = await Promise.all(
    tags.map((tag) => {
      return client.zCard(keys.by_tag(tag));
    })
  );

  const tagsWithCounts = tags.map((tag, i) => {
    return {
      tag,
      count: counts[i],
    };
  });

  const sortedTags = tagsWithCounts.sort((a, b) => {
    return b.count - a.count;
  });

  const pageOfTags = sortedTags.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return {
    tags: pageOfTags,
    stats: { page, page_size: PAGE_SIZE, total: sortedTags.length },
  };
};
