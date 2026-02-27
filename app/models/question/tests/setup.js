module.exports = function setup(options) {
  // remove all keys from the redis-db with the prefix 'blot:questions
  beforeEach(async function () {
    const client = require("models/client-new");

    const keys = await client.keys("blot:questions:*");
    if (keys.length > 0) {
      await client.del(keys);
    }
  });

  // remove all keys from the redis-db with the prefix 'blot:questions
  afterEach(async function () {
    const client = require("models/client-new");

    const keys = await client.keys("blot:questions:*");
    if (keys.length > 0) {
      await client.del(keys);
    }
  });
};
