const server = require("./upstream-server");
const fetch = require("node-fetch");
const child_process = require("child_process");
const mustache = require("mustache");
const { basename, resolve } = require("path");
const fs = require("fs-extra");
const { cache_directory } = require("../../..");

const CACHER_DIRECTORY = resolve(__dirname + "/../../");
const DATA_DIRECTORY = CACHER_DIRECTORY + "/tests/data";

const config = {
  openresty: {
    port: 8787
  },
  node: {
    port: 8788
  }
};

const inspectCache = require("./inspect-cache");

const startOpenresty = async (pathToConf, origin) => {
  try {
    const output = child_process.execSync(
      __dirname + "/start-openresty.sh " + pathToConf
    );
    // console.log(output.toString());
  } catch (e) {
    console.log("stdout: ", e.stdout.toString());
    console.log("stderr: ", e.stderr.toString());
    throw new Error("Failed to start openresty");
  }

  let connected = false;

  while (!connected) {
    try {
      // this will not be cached
      //   console.log("Checking " + origin + "/health");
      // this seems to hang sometimes, set a timeout of 1 second
      await fetch(origin + "/health", { timeout: 1000 });
      connected = true;
    } catch (e) {
      //   console.log("Openresty not started yet");
    }
  }
};

const stopOpenresty = async () => {
  try {
    const output = child_process.execSync(__dirname + "/stop-openresty.sh");
    // console.log(output.toString());
  } catch (e) {}
};

module.exports = configFile => {
  beforeEach(async function () {
    await fs.emptyDir(DATA_DIRECTORY);

    const origin = `http://127.0.0.1:${config.openresty.port}`;

    this.origin = origin;

    const cache_directory = DATA_DIRECTORY + "/cache";
    const configInput = CACHER_DIRECTORY + "/tests/" + configFile;
    const configPath = DATA_DIRECTORY + "/" + basename(configFile);

    this.cache_directory = cache_directory;

    const result = mustache.render(await fs.readFile(configInput, "utf8"), {
      ...config,
      user: process.env.BLOT_OPENRESTY_TEST_USER || "David",
      group: process.env.BLOT_OPENRESTY_TEST_GROUP || "staff",
      lua_directory: CACHER_DIRECTORY + "/conf",
      data_directory: DATA_DIRECTORY,
      cache_directory
    });

    await fs.outputFile(configPath, result, "utf8");

    await fs.mkdir(DATA_DIRECTORY + "/cache");

    await stopOpenresty();

    await startOpenresty(configPath, this.origin);

    this.server = await server({ port: config.node.port });

    this.inspectCache = ({ verbose = false, host = null } = {}) =>
      inspectCache(origin + "/inspect", cache_directory, host, verbose);

    this.restartOpenresty = async () => {
      // get the pid of the current openresty process
      const masterpid = () =>
        child_process
          .execSync(
            "ps aux | grep openresty | grep 'master process' | awk '{print $2}'"
          )
          .toString()
          .trim();

      const pidBefore = masterpid();

      await stopOpenresty();
      await startOpenresty(configPath, origin);

      // check that the pid has changed
      const pidAfter = masterpid();

      if (!pidBefore) {
        throw new Error("Openresty was not running");
      }

      if (!pidAfter) {
        throw new Error("Openresty did not start");
      }

      if (pidBefore === pidAfter) {
        throw new Error("Openresty did not restart");
      }
    };

    this.listCache = async function listCache ({ watch = true } = {}) {
      const files = [];

      const list = async function (dir) {
        const stat = await fs.stat(dir);
        if (stat.isDirectory()) {
          const children = await fs.readdir(dir);
          for (const child of children) {
            await list(dir + "/" + child);
          }
        } else {
          files.push(dir);
        }
      };

      await list(cache_directory);

      // wait for the cache to be populated
      while (files.length === 0 && watch) {
        await list(cache_directory);
      }

      return files;
    };
  });

  afterEach(async function () {
    await stopOpenresty();
    await this.server.close();
  });
};
