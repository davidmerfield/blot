module.exports = function () {
  const templates = require("templates");
  const blog = require("../../index");
  const cdn = require("../../../cdn");
  const express = require("express");
  const sync = require("sync");
  const config = require("config");

  global.test.blog();

  const router = express.Router();

  const cdnHost = new URL(config.cdn.origin).host;

  router.use((req, res, next) => {
    const host = req.get("host") || "";

    if (host === cdnHost) {
      return cdn(req, res, next);
    }

    return blog(req, res, next);
  });

  global.test.server(router);

  // Build the templates
  beforeAll(function (done) {
    templates({ watch: false }, done);
  }, 10 * 1000); // longer timeout

  beforeEach(function () {
    this.write = async ({ path, content }) => {
      await this.blog.write({ path, content });
      await this.blog.rebuild();
    };

    const blogOrigin = `${config.protocol}${this.blog.handle}.${config.host}`;

    const resolveURL = (pathOrUrl, base) => new URL(pathOrUrl, base).toString();

    this.get = (path, options = {}) =>
      this.fetch(resolveURL(path, blogOrigin), options);

    // Request with path sent literally (no URL normalization). Use for paths
    // like /%2e%2e/secret.txt or /../secret.txt that would otherwise be
    // normalized to /secret.txt by the URL API before the request is sent.
    this.getWithRawPath = (path) => {
      const url = new URL(this.origin);
      const http = require("http");
      const parsedOrigin = new URL(blogOrigin);
      return new Promise((resolve, reject) => {
        const opts = {
          hostname: url.hostname,
          port: url.port || 80,
          path,
          method: "GET",
          headers: {
            "x-forwarded-host": parsedOrigin.host,
            "x-forwarded-proto": parsedOrigin.protocol.replace(":", ""),
            "X-Forwarded-Proto": parsedOrigin.protocol.replace(":", ""),
          },
        };
        const req = http.request(opts, (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              text: () => Promise.resolve(body),
            })
          );
        });
        req.on("error", reject);
        req.end();
      });
    };

    this.text = async (path, options = {}) => {
      const res = await this.get(path, options);

      if (res.status !== 200) {
        throw new Error(`Failed to fetch ${path}: ${res.status}`);
      }

      return res.text();
    };

    this.cdnText = (path, options = {}) =>
      this.text(resolveURL(path, config.cdn.origin), options);

    this.remove = (path) => {
      return new Promise((resolve, reject) => {
        sync(this.blog.id, async (err, folder, callback) => {
          await this.blog.remove(path);
          folder.update(path, function (err) {
            if (err) return callback(err, reject);
            callback(null, resolve);
          });
        });
      });
    };

    this.write = ({ path, content }) => {
      return new Promise((resolve, reject) => {
        sync(this.blog.id, async (err, folder, callback) => {
          await this.blog.write({ path, content });
          folder.update(path, function (err) {
            if (err) return callback(err, reject);
            callback(null, resolve);
          });
        });
      });
    };

    this.template = (views = [], package = {}) => {
      return new Promise((resolve, reject) => {
        sync(this.blog.id, async (err, folder, callback) => {
          await this.blog.remove("/Templates/local");

          await this.blog.write({
            path: "/Templates/local/package.json",
            content: JSON.stringify({
              name: "local",
              locals: {},
              views: {},
              enabled: true,
              ...package,
            }),
          });

          // views is an object with keys as the path and values as the content
          for (let path in views) {
            await this.blog.write({
              path: `/Templates/local/${path}`,
              content: views[path],
            });
          }

          folder.update("/Templates/local", function (err) {
            if (err) return callback(err, reject);
            callback(null, resolve);
          });
        });
      });
    };

    this.stream = async function ({
      path,
      onStreamReady,
      expectedText,
      timeout = 4000,
    }) {
      const controller = new AbortController();
      const signal = controller.signal;
      const timer = setTimeout(() => {
        controller.abort();
        throw new Error(`Stream timed out after ${timeout}ms`);
      }, timeout); // Abort after timeout

      try {
        const res = await this.get(path, { signal });
        const reader = res.body
          ?.pipeThrough(new TextDecoderStream())
          .getReader();

        if (!reader) throw new Error("Failed to get reader from response body");

        // Execute the onStreamReady callback if provided
        if (typeof onStreamReady === "function") {
          await onStreamReady();
        }

        // Process the stream
        while (true) {
          const { value, done } = await reader.read();

          if (done) break; // Exit if the stream is finished

          if (value && value.includes(expectedText)) {
            await reader.cancel(); // Cancel the reader
            controller.abort(); // Abort the fetch request
            clearTimeout(timer); // Clear the timeout
            return value; // Return the streamed content
          }
        }

        throw new Error(`Expected text "${expectedText}" not found in stream`);
      } finally {
        clearTimeout(timer); // Ensure timeout is cleared
      }
    };
  });
};
