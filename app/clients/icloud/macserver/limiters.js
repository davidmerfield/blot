const Bottleneck = require("bottleneck");

// Create a map of limiters, one per blogID
const limiters = new Map();

/**
 * Get or create a Bottleneck limiter for a specific blogID.
 * Each blogID gets its own limiter to ensure events are processed sequentially.
 * @param {string} blogID - The blog ID for which to get the limiter.
 * @returns {Bottleneck} The Bottleneck limiter for the blogID.
 */
const getLimiterForBlogID = (blogID) => {
  if (!limiters.has(blogID)) {
    // Create a new limiter for this blogID with concurrency of 1
    console.log(`Creating limiter for blogID: ${blogID}`);
    const limiter = new Bottleneck({
      maxConcurrent: 1, // Only one task per blogID can run at a time
    });
    limiters.set(blogID, limiter);
  } else {
    console.log(`Using existing limiter for blogID: ${blogID}`);
  }

  return limiters.get(blogID);
};

const removeLimiterForBlogID = (blogID) => {
  console.log(`Removing limiter for blogID: ${blogID}`);
  limiters.delete(blogID);
};

const getLimiterCount = () => limiters.size;

module.exports = {
  getLimiterForBlogID,
  removeLimiterForBlogID,
  getLimiterCount,
};
