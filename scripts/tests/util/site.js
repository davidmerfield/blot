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
  // we must build the views for the documentation
  // and the dashboard before we launch the server
  // we also build the templates into the cache
  beforeAll(async () => {
    console.log(clfdate(), "Test site: Building views");
    await build({ watch: false });
    console.log(clfdate(), "Test site: Building templates");
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
      req.headers["host"] =
        req.headers["x-forwarded-host"] || req.headers["host"];
      req.headers["X-Forwarded-Proto"] =
        req.headers["X-Forwarded-Proto"] || "https";
      req.headers["x-forwarded-proto"] =
        req.headers["x-forwarded-proto"] || "https";
      next();
    });

    app.use(Server);

    server = app.listen(port, () => {
      console.log(clfdate(), "Test site: Server started at", this.origin);
      done();
    });

    server.on("error", (err) => {
      console.log(clfdate(), "Test site: Server error", err);
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

    this.text = (path) => {
      return new Promise((resolve, reject) => {
        this.fetch(path)
          .then((res) => {
            if (res.status !== 200)
              return reject(
                new Error(`Failed to fetch ${path}: ${res.status}`)
              );
            res.text().then((text) => resolve(text));
          })
          .catch((err) => reject(err));
      });
    };

    this.parse = (path) => {
      return new Promise((resolve, reject) => {
        this.text(path)
          .then((text) => {
            let $;
            try {
              $ = cheerio.load(text);
            } catch (e) {
              return reject(new Error(`Failed to parse HTML: ${e.message}`));
            }
            resolve($);
          })
          .catch((err) => reject(err));
      });
    };
    // can be used like so:
    // await this.submit('/sites/example/title', { title: 'New Title' });
    // will first GET the form to get the CSRF token then POST the form
    // with the provided data
    this.submit = (path, data) => {
      return new Promise(async (resolve, reject) => {
        try {
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
          const formMatch = cheerio.load(pageText)('form[action][method="post"]').attr('action');
          
          if (formMatch) {
            formPath = formMatch;
          }

          if (!csrfTokenMatch) {
            return reject(new Error("CSRF token not found in form"));
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
            return reject(new Error(`Failed to submit form: ${res.status}`));
          }

          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
    };
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
      const csrfTokenMatch = loginPageText.match(
        /name="_csrf" value="([^"]+)"/
      );

      if (!csrfTokenMatch) {
        return done(new Error("CSRF token not found in login page"));
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
        return done(
          new Error(`Failed to log in: expected status 302, got ${res.status}`)
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

      done();
    });
  }
};
