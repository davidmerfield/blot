var Jasmine = require("jasmine");
var jasmine = new Jasmine();
var colors = require("colors");
var client = require("models/client");
var clfdate = require("helper/clfdate");
var seedrandom = require("seedrandom");
var registerGlobalTest = require("./register-global-test");
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

registerGlobalTest();

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
