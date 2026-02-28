const redisSubscriber = require("helper/redisSubscriber");

module.exports = function ({ channel }) {
  return function (req, res) {
    req.socket.setTimeout(2147483647);

    res.writeHead(200, {
      // This header tells NGINX to NOT
      // buffer the response. Otherwise
      // the messages don't make it to the client.
      // A similar problem to the one caused
      // by the compression middleware a few lines down.
      "X-Accel-Buffering": "no",
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    res.write("\n");

    const subscription = redisSubscriber({
      channel: channel(req),
      onMessage: function (message) {
        res.write("\n");
        res.write("data: " + message + "\n\n");
        res.flushHeaders();
      },
      onError: function (err) {
        console.log("Redis Error: " + err);
      },
    });

    req.on("close", function () {
      subscription.cleanup();
    });
  };
};
