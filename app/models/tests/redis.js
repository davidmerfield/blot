describe("models/redis", function () {
  const { ClientOfflineError } = require("redis");
  const EventEmitter = require("events");
  const createRedisClient = require("models/redis");

  // Nothing listens on port 1, so this client is never connected
  function unreachableClient() {
    const redis = require("redis");
    const client = redis.createClient({
      url: "redis://127.0.0.1:1",
      RESP: 3,
      socket: { reconnectStrategy: () => 200 },
    });
    client.on("error", function () {});
    client.connect().catch(function () {});
    return client;
  }

  it("leaves the offline queue alone until the client has connected", function () {
    const client = new EventEmitter();
    client.options = {};
    createRedisClient.failFastOnceReady(client);
    expect(client.options.disableOfflineQueue).toBeUndefined();
    client.emit("ready");
    expect(client.options.disableOfflineQueue).toBe(true);
  });

  it("commands hang without failFast while redis is unreachable", async function () {
    const client = unreachableClient();
    const outcome = await Promise.race([
      client.get("x").then(() => "settled", () => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 500)),
    ]);
    await client.destroy();
    expect(outcome).toBe("hung");
  });

  it("commands reject immediately with failFast while redis is unreachable", async function () {
    const client = unreachableClient();
    createRedisClient.failFast(client);
    const started = Date.now();
    let error;
    try {
      await client.get("x");
    } catch (e) {
      error = e;
    }
    await client.destroy();
    expect(error instanceof ClientOfflineError).toBe(true);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it("clients from createRedisClient fail fast once connected", async function () {
    const client = createRedisClient();
    expect(client.options.disableOfflineQueue).toBeFalsy();
    await client.connect();
    await client.ping();
    expect(client.options.disableOfflineQueue).toBe(true);
    await client.quit();
  });
});
