const createUser = require("./createUser");
const removeUser = require("./removeUser");

const createBlog = require("./createBlog");
const removeBlog = require("./removeBlog");

const Server = require("server");
const checkBrokenLinks = require("./checkBrokenLinks");
const build = require("documentation/build");
const templates = require("util").promisify(require("templates"));

module.exports = function (options = {}) {
  // we must build the views for the documentation
  // and the dashboard before we launch the server
  // we also build the templates into the cache
  beforeAll(async () => {
    console.log("Building views and templates");
    await build({ watch: false, skipZip: true });
    await templates({ watch: false });
  }, 60000);

  beforeEach(createUser);
  afterEach(removeUser);

  beforeEach(createBlog);
  afterEach(removeBlog);

  let server;

  const port = 8919;

  beforeAll(function (done) {
    this.origin = `http://localhost:${port}`;

    const app = require("express")();

    // Override the host header with the x-forwarded-host header
    // it's not possible to override the Host header in fetch for 
    // lame security reasons
    // https://github.com/nodejs/node/issues/50305
    app.use((req, res, next) => {
      req.headers["host"] = req.headers["x-forwarded-host"] || req.headers["host"];
      req.headers["X-Forwarded-Proto"] = req.headers["X-Forwarded-Proto"] || "https";
      req.headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";
      next();
    });

    app.use(Server);

    server = app.listen(port, () => {
      console.log(`Test server listening at ${this.origin}`);
      done();
    });

    server.on("error", (err) => {
      console.error("Error starting test server:", err);
      done.fail(err);
    });
  });

  // Add this beforeEach hook to define the fetch function
  beforeEach(function () {
    this.fetch = (input, options = {}) => {
      const url = new URL(input, this.origin);

      if (url.hostname !== "localhost") {
        options.headers = options.headers || {};
        options.headers["Host"] = url.hostname;
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

    this.checkBrokenLinks = (url = this.origin, options = {}) =>
      checkBrokenLinks(this.fetch, url, options);
  });

  afterAll(function () {
    server.close();
  });

  if (options.login) {
    beforeEach(async function (done) {

      // first fetch the login page to get the csrf token
      const loginPage = await this.fetch("/sites/log-in", {
        redirect: "manual",
      });

      const loginHeaders = Object.fromEntries(loginPage.headers);
      const loginCookies = loginHeaders["set-cookie"];
      const csrfCookie = loginCookies.match(/csrf=([^;]+)/);

      // the response status should be 200
      expect(loginPage.status).toEqual(200);

      const loginPageText = await loginPage.text();
      const csrfTokenMatch = loginPageText.match(/name="_csrf" value="([^"]+)"/);

      if (!csrfTokenMatch) {
       return done(new Error("CSRF token not found in login page"));
      }

      const email = this.user.email;
      const password = this.user.fakePassword;

      const params = new URLSearchParams();

      params.append("email", email);
      params.append("password", password);
      params.append("_csrf", csrfTokenMatch[1]);

      console.log('here!', params);
      const res = await this.fetch("/sites/log-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: loginCookies, // Send the CSRF cookie along with the request
        },
        body: params.toString(),
        redirect: "manual",
      });


      const headers = Object.fromEntries(res.headers);

      const location = headers.location;
      const Cookie = headers["set-cookie"];

      // the response status should be 302
      // and redirect to the dashboard
      expect(res.status).toEqual(302);

      if (res.status !== 302) {
        return done(new Error(`Failed to log in: expected status 302, got ${res.status}`));
      }

      expect(Cookie).toMatch(/connect.sid/);
      expect(location).toEqual("/sites");

      // Expose the cookie to the test context so this.fetch can use it
      this.Cookie = Cookie;

      // Check that we are logged in by requesting /sites and checking the response
      // for the user's email address
      const dashboard = await this.fetch("/sites", {
        redirect: "manual",
      });

      // the response status should be 200
      expect(dashboard.status).toEqual(200);

      const dashboardText = await dashboard.text();

      expect(dashboardText).toMatch(email);

      console.log("Checking links for logged-in user");

      done();
    });
  }
};
