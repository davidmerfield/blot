module.exports = function setup(options) {
  // remove all keys from the redis-db with the prefix 'blot:questions
  beforeEach(function (done) {
    const client = require("models/client");

    client.keys("blot:questions:*", function (err, keys) {
      if (err) return done(err);
      if (keys.length > 0) {
        client.del(keys, function (err, response) {
          if (err) return done(err);
          done();
        });
      } else {
        done();
      }
    });
  });

  // remove all keys from the redis-db with the prefix 'blot:questions
  afterEach(function (done) {
    const client = require("models/client");

    client.keys("blot:questions:*", function (err, keys) {
      if (err) return done(err);
      if (keys.length > 0) {
        client.del(keys, function (err, response) {
          if (err) return done(err);
          done();
        });
      } else {
        done();
      }
    });
  });
};
