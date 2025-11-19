var Jasmine = require("jasmine");
var jasmine = new Jasmine();
var colors = require("colors");
var client = require("models/client");
var clfdate = require("helper/clfdate");
var seedrandom = require("seedrandom");
var async = require("async");
const { before } = require("lodash");
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

jasmine.addReporter({
  specStarted: function (result) {
    console.time(colors.dim(" " + result.fullName));
  },
  specDone: function (result) {
    console.timeEnd(colors.dim(" " + result.fullName));
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
  jasmineDone: function () {
    console.log(clfdate(), "Slowest specs:");
    Object.keys(durations)
      .sort(function (a, b) {
        return durations[b] - durations[a];
      })
      .map((fullName) => durations[fullName] + "ms " + colors.dim(fullName))
      .slice(0, 10)
      .forEach((line) => console.log(line));
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
