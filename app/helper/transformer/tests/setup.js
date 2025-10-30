module.exports = function setup(options) {
  var Transformer = require("../index");
  var fs = require("fs-extra");
  var Express = require("express");
  var server = Express();
  var responseBody = "Hello, World!";
  var etag = '"test-etag"';
  var lastModified = new Date("2020-01-01T00:00:00Z").toUTCString();
  var sequenceQueue = [];

  // Only server an image at this route if
  // the request passes the correct query
  server.get("/foo.html", function (req, res) {
    res.set({
      "Cache-Control": "max-age=0, must-revalidate",
      ETag: etag,
      "Last-Modified": lastModified,
    });

    var ifNoneMatch = req.get("If-None-Match");
    var ifModifiedSince = req.get("If-Modified-Since");

    if (ifNoneMatch === etag || ifModifiedSince === lastModified) {
      return res.status(304).end();
    }

    res.send(responseBody);
  });

  server.get("/sequence", function (req, res) {
    if (!sequenceQueue.length) {
      return res.status(500).send("No queued response");
    }

    var config = sequenceQueue.shift() || {};
    var status = config.status === undefined ? 200 : config.status;
    var body = config.body === undefined ? responseBody : config.body;
    var etagValue =
      config.etag === undefined ? etag : config.etag;
    var lastModifiedValue =
      config.lastModified === undefined ? lastModified : config.lastModified;
    var headers = Object.assign(
      { "Cache-Control": "max-age=0, must-revalidate" },
      config.headers || {}
    );

    if (etagValue) headers.ETag = etagValue;
    if (lastModifiedValue) headers["Last-Modified"] = lastModifiedValue;

    res.set(headers);

    if (status === 304) return res.status(304).end();

    res.status(status);

    if (status >= 400) return res.send(config.body || "");

    res.send(body);
  });

  // Create temporary blog before each test, clean up after
  global.test.blog();

  // Sets up a temporary tmp folder, cleans it up after
  global.test.tmp();

  beforeEach(function () {
    // This simulates me using the transformer to perform
    // some task that I don't want to repeat needlessly.
    // In reality, it might be the function which turns
    // an image into thumbnails, or the function which
    this.transform = function (path, done) {
      fs.stat(path, function (err, stat) {
        if (err) return done(err);

        done(null, { size: stat.size });
      });
    };

    // This represents the cache of previous transformations
    // stored for a given blog. "transformer" is just a label
    this.transformer = new Transformer(this.blog.id, "transformer");

    // Create a test file to use for the transformer
    this.path = "foo.txt";
    this.localPath = this.blogDirectory + "/" + this.path;
    fs.outputFileSync(this.localPath, "Hello, World !" + Date.now());

    sequenceQueue.length = 0;
    this.sequenceUrl = this.origin + "/sequence";
    this.queueRemoteResponse = function (config) {
      sequenceQueue.push(config || {});
    };
  });

  // Clean up the transformer used in each test
  afterEach(function (done) {
    this.transformer.flush(done);
  });

  global.test.server(server);

  // Create a webserver for testing remote files
  beforeAll(function () {
    this.url = this.origin + "/foo.html";
  });
};
