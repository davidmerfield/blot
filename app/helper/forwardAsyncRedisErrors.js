const Layer = require("express/lib/router/layer");
const { isRedisUnavailableError } = require("helper/redisUnavailable");

// Express 4 does not forward a rejected promise from an async route to the
// error middleware, so a route that awaits Redis without its own try/catch
// would leave the request open until the proxy times out. Forward Redis
// connectivity failures so they reach redisUnavailableHandler and become a
// 503. Any other rejection is rethrown so it behaves exactly as before.
if (!Layer.prototype.handle_request.forwardsRedisErrors) {
  const original = Layer.prototype.handle_request;

  const handle_request = function (req, res, next) {
    const fn = this.handle;

    if (fn.length > 3) return original.call(this, req, res, next);

    try {
      const result = fn(req, res, next);

      if (result && typeof result.then === "function") {
        result.then(undefined, function (err) {
          if (isRedisUnavailableError(err)) return next(err);
          throw err;
        });
      }
    } catch (err) {
      next(err);
    }
  };

  handle_request.forwardsRedisErrors = true;
  Layer.prototype.handle_request = handle_request;
}
