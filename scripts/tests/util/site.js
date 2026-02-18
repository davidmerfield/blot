const createUser = require("./createUser");
const removeUser = require("./removeUser");

const createBlog = require("./createBlog");
const removeBlog = require("./removeBlog");

const Server = require("server");
const checkBrokenLinks = require("./checkBrokenLinks");
const build = require("documentation/build");
const templates = require("util").promisify(require("templates"));
const cheerio = require("cheerio");

const clfdate = require("helper/clfdate");

module.exports = function (options = {}) {
  const withTimeout = async (promise, timeoutMs, stage) => {
    let timer;

    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `Test site: ${stage} timed out after ${timeoutMs}ms`
                )
              ),
            timeoutMs
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const logStage = (stage, startedAt) => {
    const elapsedMs = Date.now() - startedAt;
    console.log(clfdate(), `Test site: ${stage} (${elapsedMs}ms)`);
  };

  // we must build the views for the documentation
  // and the dashboard before we launch the server
  // we also build the templates into the cache
  beforeAll(async function () {
    const viewsStartedAt = Date.now();
    console.log(clfdate(), "Test site: building views (starting)");
    await withTimeout(
      build({ watch: false, skipZip: true }),
      45000,
      "building views"
    );
    logStage("building views complete", viewsStartedAt);

    const templatesStartedAt = Date.now();
    console.log(clfdate(), "Test site: building templates (starting)");
    await withTimeout(
      templates({ watch: false }),
      45000,
      "building templates"
    );
    logStage("building templates complete", templatesStartedAt);
  }, 60000);

  beforeEach(createUser);
  afterEach(removeUser);

  beforeEach(createBlog);
  afterEach(removeBlog);

  let server;

  const port = 8919;

  beforeAll(async function () {
    const listeningStartedAt = Date.now();
    this.origin = `http://localhost:${port}`;

    const app = require("express")();

    // Override the host header with the x-forwarded-host header
    // it's not possible to override the Host header in fetch for
    // lame security reasons
    // https://github.com/nodejs/node/issues/50305
    app.use((req, res, next) => {
      req.headers["host"] =
        req.headers["x-forwarded-host"] || req.headers["host"];
      req.headers["X-Forwarded-Proto"] =
        req.headers["X-Forwarded-Proto"] || "https";
      req.headers["x-forwarded-proto"] =
        req.headers["x-forwarded-proto"] || "https";
      next();
    });

    app.use(Server);

    await new Promise((resolve, reject) => {
      server = app.listen(port, () => {
        logStage(`server listening at ${this.origin}`, listeningStartedAt);
        resolve();
      });

      server.on("error", (err) => {
        console.log(clfdate(), "Test site: Server error", err);
        reject(err);
      });
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

        // if there is a csrf token in the cookie header already
        // extract it and include it to this.Cookie
        if (
          options.headers.Cookie &&
          /csrf=([^;]+)/.test(options.headers.Cookie)
        ) {
          const existingCsrf = options.headers.Cookie.match(/csrf=([^;]+)/)[0];
          options.headers.Cookie = `${existingCsrf}; ${this.Cookie}`;
        } else {
          options.headers.Cookie = this.Cookie;
        }
      }

      url.protocol = "http:";
      url.port = port;

      const modifiedURL = url.toString();

      return fetch(modifiedURL, options);
    };

    this.checkBrokenLinks = (url = this.origin, options = {}) =>
      checkBrokenLinks(this.fetch, url, options);

    this.text = async (path) => {
      const res = await this.fetch(path);

      if (res.status !== 200) {
        throw new Error(`Failed to fetch ${path}: ${res.status}`);
      }

      return res.text();
    };

    this.parse = async (path) => {
      const text = await this.text(path);

      try {
        return cheerio.load(text);
      } catch (e) {
        throw new Error(`Failed to parse HTML: ${e.message}`);
      }
    };
    // can be used like so:
    // await this.submit('/sites/example/title', { title: 'New Title' });
    // will first GET the form to get the CSRF token then POST the form
    // with the provided data
    this.submit = async (path, data) => {
      // first fetch the page to get the csrf token
      const page = await this.fetch(path, {
        redirect: "manual",
      });

      const headers = Object.fromEntries(page.headers);
      const cookies = headers["set-cookie"];
      const csrfCookie = cookies.match(/csrf=([^;]+)/);

      // the response status should be 200
      expect(page.status).toEqual(200);

      const pageText = await page.text();
      const csrfTokenMatch = pageText.match(/name="_csrf" value="([^"]+)"/);

      let formPath = path;

      // determine the form path in case it is different
      const formMatch = cheerio
        .load(pageText)('form[action][method="post"]')
        .attr("action");

      if (formMatch) {
        formPath = formMatch;
      }

      if (!csrfTokenMatch) {
        throw new Error("CSRF token not found in form");
      }

      const params = new URLSearchParams();

      for (const key in data) {
        params.append(key, data[key]);
      }

      params.append("_csrf", csrfTokenMatch[1]);

      const res = await this.fetch(formPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies, // Send the CSRF cookie along with the request
        },
        body: params.toString(),
      });

      if (res.status >= 400) {
        throw new Error(`Failed to submit form: ${res.status}`);
      }

      return res;
    };
  });

  afterAll(async function () {
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          return reject(err);
        }

        resolve();
      });
    });
  });

  if (options.login) {
    beforeEach(async function () {
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
      const csrfTokenMatch = loginPageText.match(
        /name="_csrf" value="([^"]+)"/
      );

      if (!csrfTokenMatch) {
        throw new Error("CSRF token not found in login page");
      }

      const email = this.user.email;
      const password = this.user.fakePassword;

      const params = new URLSearchParams();

      params.append("email", email);
      params.append("password", password);
      params.append("_csrf", csrfTokenMatch[1]);

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
        throw new Error(
          `Failed to log in: expected status 302, got ${res.status}`
        );
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

    });
  }
};
