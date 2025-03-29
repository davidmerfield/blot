module.exports = function () {
  const templates = require("templates");
  const blog = require("../../index");
  const sync = require("sync");
  const config = require("config");

  global.test.blog();

  global.test.server(blog);

  // Build the templates
  beforeAll(function (done) {
    templates({ watch: false }, done);
  });

  beforeEach(function () {
    this.write = async ({ path, content }) => {
      await this.blog.write({ path, content });
      await this.blog.rebuild();
    };

    this.get = (path, options = {}) =>
      this.fetch(
        `${config.protocol}${this.blog.handle}.${config.host}${path}`,
        options
      );

    this.text = (path, options = {}) => {
      return new Promise((resolve, reject) => {
        this.get(path, options)
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
