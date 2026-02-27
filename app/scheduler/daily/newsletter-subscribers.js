async function main(callback) {
  var client = require("models/client-new");

  try {
    const subscribers = await client.smembers("newsletter:list");
    callback(null, { newsletter_subscribers: subscribers.length });
  } catch (err) {
    callback(err);
  }
}

module.exports = main;

if (require.main === module) require("./cli")(main);
