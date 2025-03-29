const Express = require("express");
const trace = require("helper/trace");
const checkBrokenLinks = require("./checkBrokenLinks");

module.exports = function (router) {
  let server;
  const port = 8919;

  if (!router || !router.use) {
    throw new Error("router must be an express router");
  }
  
  beforeAll(function (done) {
    this.origin = `http://localhost:${port}`;

    // Move the fetch function definition to a beforeEach hook
    // so it has access to the latest this.Cookie value
    const app = Express();

    app.use((req, res, next) => {
      req.headers["host"] = req.headers["x-forwarded-host"];
      req.headers["X-Forwarded-Proto"] = req.headers["X-Forwarded-Proto"] || "https";
      req.headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";
      next();
    });

    app.use(trace.init);
    app.use(require('request-logger'));
    app.set("trust proxy", true);
    app.disable("x-powered-by");
    app.set("etag", false);
    app.use(router);

    server = app.listen(port, () => {
      console.log(`Test server listening at ${this.origin}`);
      done();
    });

    server.on('error', (err) => {
      console.error("Error starting test server:", err);
      done.fail(err);
    });
  });

  // Add this beforeEach hook to define the fetch function
  beforeEach(function() {
    this.fetch = (input, options = {}) => {
      const url = new URL(input, this.origin);

      if (url.hostname !== "localhost") {
        options.headers = options.headers || {};
        options.headers["x-forwarded-host"] = url.hostname;
        url.hostname = "localhost";
      }

      // Now this.Cookie will be available from the current context
      if (this.Cookie) {
        options.headers = options.headers || {};
        options.headers.Cookie = this.Cookie;
      } 

      url.protocol = "http:";
      url.port = port;

      const modifiedURL = url.toString();

      return fetch(modifiedURL, options);
    };

    this.checkBrokenLinks = (url = this.origin, options = {}) => checkBrokenLinks(this.fetch, url, options);
  });

  afterAll(function () {
    server.close();
  });
};