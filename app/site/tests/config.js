describe("Blot configuration", function () {
  // The test to start the main server
  // and resolve unused dependencies both
  // needs a little longer to run. 50s should be plenty
  global.test.timeout(50 * 1000);

  // TODO: check that g
  it("config loads without error", function () {
    expect(function () {
      require("config");
    }).not.toThrow();
  });

  var fetch = require("node-fetch");
  var START_MESSAGE = "listening";
  var server;
  var stderr = "";

  beforeAll(function (done) {
    server = require("child_process").fork(__dirname + "/../../../app", {
      silent: true
    });

    // App should not emit anything on standard error
    server.stderr.on("data", function (data) {
      stderr += data.toString("utf8") + "\n";
    });

    // Listen for listening message
    server.stdout.on("data", function (data) {
      // This is a bit of a flimsy check to see if the server is running
      // there might be more than one message with listening in
      if (data.toString("utf8").indexOf(START_MESSAGE) > -1) {
        done();
      }
    });
  });

  afterAll(function (done) {
    server.on("exit", function () {
      done();
    });

    server.kill();
  });

  it("returns OK at the health endpoint", async function () {
    console.log("fetching health");

    const res = await fetch("http://localhost:8080/health");

    expect(res.status).toBe(200);

    console.log("fetching health body");

    const body = await res.text();

    expect(body).toEqual("OK");
  });

  it("can connect to redis", function (done) {
    require("models/client").ping(function (err, res) {
      expect(err).toBe(null);
      expect(res).toBe("PONG");
      done();
    });
  });
});
