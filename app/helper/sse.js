const redis = require("models/redis");

module.exports = function ({ channel }) {
  return function (req, res) {
    var client = new redis();

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

    client.subscribe(channel(req));

    client.on("message", function (channel, message) {
      res.write("\n");
      res.write("data: " + message + "\n\n");
      res.flushHeaders();
    });

    // In case we encounter an error...print it out to the console
    client.on("error", function (err) {
      console.log("Redis Error: " + err);
    });

    req.on("close", function () {
      client.unsubscribe();
      client.quit();
    });
  };
};
