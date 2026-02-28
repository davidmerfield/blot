const createRedisClient = require("models/redis-new");

module.exports = function redisSubscriber({
  channel,
  onMessage,
  onError,
  logger = console,
}) {
  const client = createRedisClient();
  const messageHandler = typeof onMessage === "function" ? onMessage : function () {};
  let cleanedUp = false;

  function logRedisError(err) {
    if (typeof onError === "function") {
      return onError(err);
    }

    logger.log("Redis Error:", err);
  }

  client.on("error", logRedisError);

  const setupPromise = Promise.resolve()
    .then(async function () {
      await client.connect();
      await client.subscribe(channel, function (message, subscribedChannel) {
        try {
          messageHandler(message, subscribedChannel || channel);
        } catch (err) {
          logRedisError(err);
        }
      });
    })
    .catch(async function (err) {
      logRedisError(err);
      await cleanup();
    });

  async function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;

    try {
      if (client.isOpen) {
        await client.unsubscribe(channel);
      }
    } catch (err) {
      logRedisError(err);
    }

    try {
      if (client.isOpen) {
        await client.quit();
      }
    } catch (err) {
      logRedisError(err);
    }
  }

  return {
    client,
    cleanup,
    setupPromise,
  };
};
