function main (callback) {
  var redis = require("models/redis");
  var client = new redis();
  client.smembers("newsletter:list", function (err, subscribers) {
    callback(null, { newsletter_subscribers: subscribers.length });
  });
}

module.exports = main;

if (require.main === module) require("./cli")(main);
