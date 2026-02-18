const flushCache = require("../flushCache");
const express = require("express");

describe("flushCache", function () {
  let BASE_PORT = 8400;

  beforeEach(function () {
    this.setup = ({ onPurge }) => {
      const app = express();
      const port = BASE_PORT++;
      const reverse_proxies = [`http://localhost:${port}`];

      app.get("/purge", onPurge);

      this.flush = flushCache({ reverse_proxies, requestsPerSecond: 1 });
      this.server = app.listen(port);

      return { port, reverse_proxies };
    };
  });

  afterEach(function () {
    if (this.server) {
      this.server.close();
    }
  });

  it("successfully flushes a single host", async function () {
    let purgeCount = 0;

    await this.setup({
      onPurge: (req, res) => {
        purgeCount++;
        expect(req.query.host).toEqual("example.com");
        res.send("ok");
      },
    });

    await this.flush("example.com");
    expect(purgeCount).toBe(1);
  });

  it("if you submit the same host multiple times, purge is merged", async function () {
    let purgeCount = 0;

    await this.setup({
      onPurge: (req, res) => {
        purgeCount++;
        expect(req.query.host).toEqual("example.com");
        res.send("ok");
      },
    });

    const purges = [];

    for (let i = 0; i < 10; i++) {
      purges.push(this.flush(["example.com", "example.com"]));
    }

    await Promise.all(purges);

    // the purge count should be less than the total number of purges
    // because the purges were merged
    expect(purgeCount).toBeLessThan(10);
    expect(purgeCount).toBeGreaterThan(0);
  });

  it("handles multiple hosts in a single request", async function () {
    const hosts = ["example1.com", "example2.com", "example3.com"];
    let receivedHosts;

    await this.setup({
      onPurge: (req, res) => {
        receivedHosts = Array.isArray(req.query.host)
          ? req.query.host
          : [req.query.host];
        res.send("ok");
      },
    });

    await this.flush(hosts);
    expect(receivedHosts).toEqual(hosts);
  });

  it("respects rate limiting", async function () {
    const timestamps = [];
    const { reverse_proxies } = await this.setup({
      onPurge: (req, res) => {
        timestamps.push(Date.now());
        res.send("ok");
      },
    });

    const flush = flushCache({ reverse_proxies, requestsPerSecond: 1 });

    const purges = [];

    for (let i = 0; i < 30; i++) {
      purges.push(flush(`example${i}.com`));
    }

    await Promise.all(purges);

    // purge will merge requests in batches of up to 10 hosts and process at most
    // one purge request per second, so we should have at least 3 batches of hosts
    // across at least 3 seconds

    console.log("timestamps", timestamps);

    const gaps = timestamps
      .slice(1)
      .map((timestamp, i) => timestamp - timestamps[i]);

    console.log("gaps", gaps);

    expect(timestamps.length).toBeGreaterThanOrEqual(3);
    expect(timestamps.at(-1) - timestamps[0]).toBeGreaterThanOrEqual(3000);
  });

  it("handles failed requests appropriately", async function () {
    await this.setup({
      onPurge: (req, res) => res.status(500).send("error"),
    });

    try {
      await this.flush("example.com");
      fail("Should have thrown an error");
    } catch (error) {
      expect(error instanceof Error).toBe(true);
    }
  });

  it("handles multiple reverse proxies", async function () {
    const app1 = express();
    const app2 = express();
    const port1 = BASE_PORT++;
    const port2 = BASE_PORT++;

    let proxy1Called = false;
    let proxy2Called = false;

    app1.get("/purge", (req, res) => {
      proxy1Called = true;
      res.send("ok");
    });

    app2.get("/purge", (req, res) => {
      proxy2Called = true;
      res.send("ok");
    });

    const server1 = app1.listen(port1);
    const server2 = app2.listen(port2);

    const flush = flushCache({
      reverse_proxies: [
        `http://localhost:${port1}`,
        `http://localhost:${port2}`,
      ],
      requestsPerSecond: 10,
    });

    await flush("example.com");

    expect(proxy1Called).toBe(true);
    expect(proxy2Called).toBe(true);

    server1.close();
    server2.close();
  });

  it("validates input parameters", async function () {
    await this.setup({
      onPurge: (req, res) => res.send("ok"),
    });

    try {
      await this.flush({ invalid: "input" });
      fail("Should have thrown an error");
    } catch (error) {
      expect(error instanceof Error).toBe(true);
    }
  });

  // Re-implement when we have a timeout mechanism
  xit("handles network errors gracefully", async function () {
    const flush = flushCache({
      reverse_proxies: ["http://invalid-domain-name:12345"],
      requestsPerSecond: 10,
    });

    try {
      await flush("example.com");
      fail("Should have thrown an error");
    } catch (error) {
      expect(error instanceof Error).toBe(true);
    }
  });
});
