const redis = require("models/redis");

module.exports = function redisSubscriber({
  channel,
  onMessage,
  onError,
  logger = console,
}) {
  const client = new redis();
  const messageHandler = typeof onMessage === "function" ? onMessage : function () {};
  let cleanedUp = false;

  function logRedisError(err) {
    if (typeof onError === "function") {
      return onError(err);
    }

    logger.log("Redis Error:", err);
  }

  client.on("error", logRedisError);

  Promise.resolve(
    client.subscribe(channel, function (message, subscribedChannel) {
      try {
        messageHandler(message, subscribedChannel || channel);
      } catch (err) {
        logRedisError(err);
      }
    })
  ).catch(logRedisError);

  async function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;

    try {
      await client.unsubscribe(channel);
    } catch (err) {
      logRedisError(err);
    }

    try {
      await client.quit();
    } catch (err) {
      logRedisError(err);
    }
  }

  return {
    client,
    cleanup,
  };
};
