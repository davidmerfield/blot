var Jasmine = require("jasmine");
var jasmine = new Jasmine();
var colors = require("colors");
var client = require("models/client");
var clfdate = require("helper/clfdate");
var seedrandom = require("seedrandom");
var async = require("async");
const asyncHooks = require("async_hooks");
var seed;
var config = {
  spec_dir: "",
  spec_files: [
    "**/tests/**/*.js",
    "**/tests.js",
    // Exclude node_modules since we don't want to run tests in dependencies
    "!**/node_modules/**",
  ],
  helpers: [],
  stopSpecOnExpectationFailure: false,
  random: true,
};
// Collect only the user-passed args.
// If "--" is present, only consider args after it.
const rawArgs = process.argv.slice(2);
const dashdash = rawArgs.indexOf("--");
const args = dashdash >= 0 ? rawArgs.slice(dashdash + 1) : rawArgs;

// Pass in a custom test glob for running only specific tests
if (args[0]) {
  console.log(clfdate(), "Running specs in", colors.cyan(args[0]));

  // Specific file
  if (args[0].endsWith(".js")) {
    config.spec_files = [args[0]];
  } else {
    // Directory
    config.spec_dir = args[0];
  }
} else {
  console.log(
    clfdate(),
    "If you want to run tests from a subdirectory:",
    colors.cyan("npm test app/models"),
    "or",
    colors.cyan("npm test -- app/models")
  );
}

// Seed: 2nd positional arg, or env, or random
if (args[1]) {
  seed = args[1];
} else {
  seed =
    process.env.BLOT_TESTS_SEED || String(Math.floor(Math.random() * 100000));
  console.log(
    clfdate(),
    "If you want your own seed run:",
    colors.cyan("npm test app/models/test.js SEED"),
    "or",
    colors.cyan("npm test -- app/models/test.js SEED")
  );
}

seedrandom(seed, { global: true });
jasmine.seed(seed);
jasmine.loadConfig(config);

// Build command for re-running with DEBUG
function buildDebugCommand() {
  var cmd = "DEBUG=blot* npm test";
  if (args[0]) cmd += " " + args[0];
  if (args[1]) cmd += " " + args[1];
  return cmd;
}

// Log DEBUG command at start (only if DEBUG is not already set)
if (!process.env.DEBUG) {
  console.log(
    clfdate(),
    "To run with debug logs:",
    colors.cyan(buildDebugCommand())
  );
}

jasmine.addReporter({
  specStarted: function (result) {
    console.time(colors.dim(" " + result.fullName));
  },
  specDone: function (result) {
    console.timeEnd(colors.dim(" " + result.fullName));
  },
});

jasmine.addReporter({
  jasmineDone: function (result) {
    process.exitCode = result.overallStatus === "passed" ? 0 : 1;

    client.quit(function (err) {
      if (err) {
        console.warn(
          clfdate(),
          colors.yellow("[tests] Failed to quit redis client"),
          err.message || err
        );
      }
    });

    const diagnosticGraceMs = Number(
      process.env.BLOT_TESTS_EXIT_GRACE_TIMEOUT_MS || 0
    );

    if (!Number.isFinite(diagnosticGraceMs) || diagnosticGraceMs <= 0) {
      return;
    }

    const sourceByResource = new WeakMap();
    const hook = asyncHooks.createHook({
      init: function (_asyncId, type, _triggerAsyncId, resource) {
        if (!resource || sourceByResource.has(resource)) return;
        const source = new Error().stack
          .split("\n")
          .slice(2)
          .map((line) => line.trim())
          .filter((line) => !line.includes("scripts/tests/index.js"))
          .slice(0, 8)
          .join("\n");

        sourceByResource.set(resource, { type, source });
      },
    });

    hook.enable();

    const gracefulExitTimer = setTimeout(function () {
      hook.disable();

      const handles = process._getActiveHandles();
      if (!handles.length) return;

      console.log();
      console.warn(
        clfdate(),
        colors.yellow(
          `[tests] Process did not exit within ${diagnosticGraceMs}ms. Active handles:`
        )
      );

      handles.forEach(function (handle, index) {
        const details = sourceByResource.get(handle);
        const type =
          (details && details.type) ||
          (handle && handle.constructor && handle.constructor.name) ||
          typeof handle;

        console.warn(
          colors.yellow(`  [${index + 1}] ${type}`),
          handle && handle.constructor && handle.constructor.name
            ? colors.dim(`(${handle.constructor.name})`)
            : ""
        );

        if (index === 0 && details && details.source) {
          console.warn(colors.yellow("    First still-open handle source:"));
          console.warn(colors.dim(details.source));
        }
      });

      const requests = process._getActiveRequests();
      if (requests.length) {
        console.warn(
          colors.yellow(`  Active requests: ${requests.length}`)
        );
      }
    }, diagnosticGraceMs);

    gracefulExitTimer.unref();

  },
});

var startTimes = {};
var durations = {};

jasmine.addReporter({
  specStarted: function (result) {
    startTimes[result.fullName] = Date.now();
  },
  specDone: function (result) {
    durations[result.fullName] = Date.now() - startTimes[result.fullName];
  },
  jasmineDone: function (result) {
    console.log(clfdate(), "Slowest specs:");
    Object.keys(durations)
      .sort(function (a, b) {
        return durations[b] - durations[a];
      })
      .map((fullName) => durations[fullName] + "ms " + colors.dim(fullName))
      .slice(0, 10)
      .forEach((line) => console.log(line));
    
    // If tests failed, show how to re-run with DEBUG (only if DEBUG is not already set)
    if (result.overallStatus === "failed" && !process.env.DEBUG) {
      console.log();
      console.log("Re-run with debug logs:");
      console.log(colors.cyan(buildDebugCommand()));
      console.log();
    }
  },
});

global.test = {
  CheckEntry: require("./util/checkEntry"),
  SyncAndCheck: require("./util/syncAndCheck"),

  compareDir: require("./util/compareDir"),

  fake: require("./util/fake"),

  user: function () {
    beforeEach(require("./util/createUser"));
    afterEach(require("./util/removeUser"));
  },

  server: require("./util/server"),

  site: require("./util/site"),

  templates: require("./util/templates"),

  timeout: function (ms) {
    // Store original value
    let originalTimeout;

    beforeAll(function () {
      // In your setup, jasmine.DEFAULT_TIMEOUT_INTERVAL isn't available
      // We need to access the timeout through the Jasmine instance
      originalTimeout = jasmine.jasmine.DEFAULT_TIMEOUT_INTERVAL;
      jasmine.jasmine.DEFAULT_TIMEOUT_INTERVAL = ms;
    });

    afterAll(function () {
      jasmine.jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout || 5000;
    });
  },

  blogs: function (total) {
    beforeEach(require("./util/createUser"));
    afterEach(require("./util/removeUser"));

    beforeEach(function (done) {
      var context = this;
      context.blogs = [];
      async.times(
        total,
        function (blog, next) {
          var result = { user: context.user };
          require("./util/createBlog").call(result, function () {
            context.blogs.push(result.blog);
            next();
          });
        },
        done
      );
    });

    afterEach(function (done) {
      var context = this;
      async.each(
        this.blogs,
        function (blog, next) {
          require("./util/removeBlog").call(
            { user: context.user, blog: blog },
            next
          );
        },
        done
      );
    });
  },

  blog: function () {
    beforeEach(require("./util/createUser"));
    afterEach(require("./util/removeUser"));

    beforeEach(require("./util/createBlog"));
    afterEach(require("./util/removeBlog"));
  },

  tmp: function () {
    beforeEach(require("./util/createTmpDir"));
    afterEach(require("./util/removeTmpDir"));
  },
};

// get the number of keys in the database
client.keys("*", function (err, keys) {
  if (err) {
    throw err;
  }
  if (keys.length === 0) {
    // if there are no keys, we need to run the tests
    jasmine.execute();
  } else {
    // if there are keys, we need to throw an error
    throw new Error("Database is not empty: " + keys.length + " keys found");
  }
});
