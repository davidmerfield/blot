const createRedisClient = require("models/redis");

module.exports = function redisSubscriber({
  channel,
  onMessage,
  onError,
  logger = console,
}) {
  const client = createRedisClient();
  const messageHandler = typeof onMessage === "function" ? onMessage : function () {};
  let cleanedUp = false;
  let cleanupPromise;

  function logRedisError(err) {
    if (typeof onError === "function") {
      return onError(err);
    }

    logger.log("Redis Error:", err);
  }

  client.on("error", logRedisError);

  async function disconnect() {
    try {
      if (client.isOpen) await client.unsubscribe(channel);
    } catch (err) {
      logRedisError(err);
    }

    try {
      if (client.isOpen) await client.quit();
    } catch (err) {
      logRedisError(err);
    }

    client.removeListener("error", logRedisError);
  }

  const setupPromise = Promise.resolve()
    .then(async function () {
      await client.connect();
      if (cleanedUp) return;

      await client.subscribe(channel, function (message, subscribedChannel) {
        if (cleanedUp) return;
        try {
          messageHandler(message, subscribedChannel || channel);
        } catch (err) {
          logRedisError(err);
        }
      });
    })
    .catch(async function (err) {
      logRedisError(err);
      cleanedUp = true;
      await disconnect();
    });

  function cleanup() {
    if (cleanupPromise) return cleanupPromise;
    cleanedUp = true;
    // Waiting for setup closes both race windows: a connect which finishes after
    // cleanup, and a subscribe already in flight when cleanup is requested.
    cleanupPromise = setupPromise.then(disconnect, disconnect);
    return cleanupPromise;
  }

  return {
    client,
    cleanup,
    setupPromise,
  };
};
