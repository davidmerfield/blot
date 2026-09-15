const EventEmitter = require("events");

describe("sse", function () {
  const ssePath = require.resolve("helper/sse");
  const subscriberPath = require.resolve("helper/redisSubscriber");
  let originalSubscriber;

  beforeEach(function () {
    originalSubscriber = require.cache[subscriberPath];
    jasmine.clock().install();
  });

  afterEach(function () {
    jasmine.clock().uninstall();
    delete require.cache[ssePath];
    if (originalSubscriber) require.cache[subscriberPath] = originalSubscriber;
    else delete require.cache[subscriberPath];
  });

  ["aborted", "close"].forEach(function (signal) {
    it("cleans up once on request " + signal + " and response close", function () {
      const cleanup = jasmine.createSpy("cleanup");
      let onMessage;
      require.cache[subscriberPath] = {
        exports: function (options) {
          onMessage = options.onMessage;
          return { cleanup };
        },
      };
      delete require.cache[ssePath];

      const req = new EventEmitter();
      req.socket = { setTimeout: jasmine.createSpy("setTimeout") };
      const res = new EventEmitter();
      res.writeHead = jasmine.createSpy("writeHead");
      res.write = jasmine.createSpy("write");
      res.flushHeaders = jasmine.createSpy("flushHeaders");
      require("helper/sse")({ channel: function () { return "test"; } })(req, res);
      res.write.calls.reset();

      req.emit(signal);
      req.emit("close");
      res.emit("close");
      onMessage("late");
      jasmine.clock().tick(20000);

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  it("keeps preview-compatible ten-second heartbeats", function () {
    require.cache[subscriberPath] = {
      exports: function () { return { cleanup: function () {} }; },
    };
    delete require.cache[ssePath];
    const sse = require("helper/sse");
    expect(sse.HEARTBEAT_INTERVAL_MS).toBe(10000);
  });
});
