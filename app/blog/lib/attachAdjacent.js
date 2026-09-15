const { adjacentTo } = require("./models");

// Attach next/previous/index/adjacent onto an entry for rendering.
module.exports = async function attachAdjacent(blogID, entry, cacheID) {
  const adjacent = await adjacentTo(blogID, entry.id, cacheID);
  entry.next = adjacent.next;
  entry.previous = adjacent.previous;
  entry.adjacent = !!(adjacent.next || adjacent.previous);
  entry.index = adjacent.index;
  return entry;
};
