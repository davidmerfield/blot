const EventEmitter = require("events");

describe("redisSubscriber", function () {
  const subscriberPath = require.resolve("helper/redisSubscriber");
  const redisPath = require.resolve("models/redis");
  let originalRedis;

  beforeEach(function () {
    originalRedis = require.cache[redisPath];
  });

  afterEach(function () {
    delete require.cache[subscriberPath];
    if (originalRedis) require.cache[redisPath] = originalRedis;
    else delete require.cache[redisPath];
  });

  it("closes a client when cleanup happens while connect is pending", async function () {
    let finishConnect;
    const client = new EventEmitter();
    client.isOpen = false;
    client.connect = jasmine.createSpy("connect").and.callFake(function () {
      return new Promise(function (resolve) {
        finishConnect = function () {
          client.isOpen = true;
          resolve();
        };
      });
    });
    client.subscribe = jasmine.createSpy("subscribe");
    client.unsubscribe = jasmine.createSpy("unsubscribe").and.callFake(function () {
      return Promise.resolve();
    });
    client.quit = jasmine.createSpy("quit").and.callFake(function () {
      client.isOpen = false;
      return Promise.resolve();
    });

    require.cache[redisPath] = { exports: function () { return client; } };
    delete require.cache[subscriberPath];
    const subscription = require("helper/redisSubscriber")({ channel: "test" });

    const firstCleanup = subscription.cleanup();
    expect(subscription.cleanup()).toBe(firstCleanup);
    await Promise.resolve();
    finishConnect();
    await firstCleanup;

    expect(client.subscribe).not.toHaveBeenCalled();
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.isOpen).toBe(false);
  });

  it("suppresses messages after cleanup", async function () {
    let redisMessage;
    const onMessage = jasmine.createSpy("onMessage");
    const client = new EventEmitter();
    client.isOpen = false;
    client.connect = async function () { client.isOpen = true; };
    client.subscribe = async function (_channel, callback) { redisMessage = callback; };
    client.unsubscribe = async function () {};
    client.quit = async function () { client.isOpen = false; };

    require.cache[redisPath] = { exports: function () { return client; } };
    delete require.cache[subscriberPath];
    const subscription = require("helper/redisSubscriber")({
      channel: "test",
      onMessage,
    });
    await subscription.setupPromise;
    await subscription.cleanup();
    redisMessage("late");

    expect(onMessage).not.toHaveBeenCalled();
  });
});
