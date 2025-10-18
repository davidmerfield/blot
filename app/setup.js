const config = require("config");
const fs = require("fs-extra");

const client = require("models/client");
const documentation = require("./documentation/build");
const templates = require("./templates");
const folders = require("./templates/folders");
const async = require("async");
const clfdate = require("helper/clfdate");
const scheduler = require("./scheduler");
const flush = require("documentation/tools/flush-cache");
const configureLocalBlogs = require("./configure-local-blogs");

const log = (...args) =>
  console.log.apply(null, [clfdate(), "Setup:", ...args]);

async function runPostListenTasks() {
  log("Running post-listen tasks asynchronously");
  const logError = (message, error) => {
    console.error(clfdate(), "Setup:", message, error || "");
  };

  try {
    if (config.master) {
      log("Starting scheduler asynchronously");
      scheduler();
    }
  } catch (err) {
    logError("Failed to start scheduler", err);
  }

  try {
    if (config.master) {
      const clients = Object.values(require("clients"));
      for (const { init, display_name } of clients) {
        if (init) {
          console.log(
            clfdate(),
            display_name + " client:",
            "Initializing asynchronously"
          );
          try {
            init();
          } catch (err) {
            logError(`Error initializing ${display_name} client`, err);
          }
        }
      }
    }
  } catch (err) {
    logError("Failed while initializing clients", err);
  }

  try {
    log("Flushing caches asynchronously");
    flush();
  } catch (err) {
    logError("Failed to flush caches", err);
  }

  try {
    if (config.environment === "development") {
      log("Configuring local blogs asynchronously");
      configureLocalBlogs();
    }
  } catch (err) {
    logError("Failed to configure local blogs", err);
  }

  if (config.master && config.environment === "production") {
    log("Building folders asynchronously");

    setImmediate(async () => {
      try {
        await folders();
        log("Built folders asynchronously");
      } catch (err) {
        logError("Error building folders", err);
      }
    });
  }

  if (config.environment !== "production") {
    log("Skipping CDN purge (not in production)");
    return;
  }

  if (!config.bunny.secret) {
    log("Skipping CDN purge (missing credentials)");
    return;
  }

  try {
    const cdnURL = require("documentation/tools/cdn-url-helper")({
      cacheID: new Date().getTime(),
      viewDirectory: config.views_directory,
    })();

    const urls = [
      "/dashboard.min.css",
      "/dashboard.min.js",
      "/documentation.min.css",
      "/documentation.min.js",
    ]
      .map((path) => cdnURL(path, (p) => p))
      .map((p) => encodeURIComponent(p));

    for (const urlToPurge of urls) {
      const url = `https://api.bunny.net/purge?url=${urlToPurge}&async=false`;
      const options = {
        method: "POST",
        headers: { AccessKey: config.bunny.secret },
      };
      console.log("Purging Bunny CDN cache", url);
      const res = await fetch(url, options);
      if (res.status !== 200) {
        console.error("Failed to purge Bunny CDN cache", res.status);
      } else {
        console.log("Purged Bunny CDN cache", res.status);
      }
    }
  } catch (err) {
    logError("Failed to run function to purge Bunny CDN cache", err);
  }
}

function main(callback) {
  async.series(
    [
      async function () {
        log("Creating required directories");
        await fs.ensureDir(config.blog_folder_dir);
        await fs.ensureDir(config.blog_static_files_dir);
        await fs.ensureDir(config.log_directory);
        await fs.ensureDir(config.tmp_directory);
        log("Created required directories");
      },

      function (callback) {
        // Blot's SSL certificate system requires the existence
        // of the domain key in redis. See config/nginx/auto-ssl.conf
        // for more information about the specific implementation.
        // Anyway, so that the homepage. We redirect the 'www' subdomain
        // to the apex domain, but we need to generate a cert to do this.
        // Typically, domain keys like domain:example.com store a blog's ID
        // but since the homepage is not a blog, we just use a placeholder 'X'
        log("Creating SSL key for redis");
        client.msetnx(
          ["domain:" + config.host, "X", "domain:www." + config.host, "X"],
          function (err) {
            if (err) {
              console.error(
                "Unable to set domain flag for host" +
                  config.host +
                  ". SSL may not work on site."
              );
              console.error(err);
            }

            log("Created SSL key for redis");
            callback();
          }
        );
      },

      function (callback) {
        // we only want to build the templates once per deployment
        if (config.master) {
          log("Building templates");
          templates(
            // we only want to watch for changes in the templates in development
            { watch: config.environment === "development" },
            function (err) {
              if (err) throw err;
              log("Built templates");
              callback();
            }
          );
        } else {
          log("Skipping template build");
          callback();
        }
      },

      async function () {
        // The docker build stage for production runs this script ahead of time
        if (config.environment !== "development") return;
        await documentation({ watch: true });
      },

    ],
    callback
  );
}

main.runPostListenTasks = runPostListenTasks;

module.exports = main;
