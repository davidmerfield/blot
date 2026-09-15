// Yield so a long synchronous stretch (Mustache.render, parse5.parse of a
// large page) does not starve other connections on the single-threaded loop.
module.exports = function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
};
