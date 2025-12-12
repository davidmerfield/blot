const Bottleneck = require("bottleneck");

const globalLimiter = new Bottleneck({
  maxConcurrent: 4,
  minTime: 100,
});

const domainLimiter = new Bottleneck.Group({
  maxConcurrent: 2,
});

module.exports = {
  domainLimiter,
  globalLimiter,
};
