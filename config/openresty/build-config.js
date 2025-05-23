const mustache = require("mustache");
const config = require("config");
const fs = require("fs-extra");
const child_process = require("child_process");

function loadEnvFile() {
  const envPath = require('path').join(__dirname, "..", "..", ".env");
  try {
    const envContent = fs.readFileSync(envPath, "utf8");
    const envVars = envContent
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .reduce((vars, line) => {
        const [key, ...valueParts] = line.split("=");
        const value = valueParts.join("=").trim();
        if (key && value) {
          vars[key.trim()] = value.replace(/^["']|["']$/g, "");
        }
        return vars;
      }, {});

    Object.assign(process.env, envVars);
  } catch (error) {
    console.error("Error reading .env file:", error);
  }
}

loadEnvFile();

const NETDATA_USER = process.env.NETDATA_USER;
const NETDATA_PASSWORD = process.env.NETDATA_PASSWORD;
const NETDATA_PORT = process.env.NETDATA_PORT;

const NODE_SERVER_IP = process.env.NODE_SERVER_IP;
const REDIS_IP = process.env.REDIS_IP;

if (!NODE_SERVER_IP) throw new Error("NODE_SERVER_IP not set");
if (!REDIS_IP) throw new Error("REDIS_IP not set");

const OUTPUT = __dirname + "/data/latest";
const PREVIOUS = OUTPUT + "-previous-" + Date.now();
const CONFIG_DIRECTORY = __dirname + "/conf";

const template = fs.readFileSync(`${CONFIG_DIRECTORY}/server.conf`, "utf8");
const partials = {};

// remote config directory on the ec2 instance to which we will copy the config files
const config_directory =
  process.env.OPENRESTY_CONFIG_DIRECTORY || "/home/ec2-user/openresty";

// max file size for icloud uploads and webhooks bodies
// nginx requires 'M' instead of 'MB' but unfortunately
// node rawbody parser requires 'MB' instead of 'M'
// so this maps '25MB' to '25M' for nginx
const iCloud_max_body_size = `${config.icloud.maxFileSize / 1000000}M`;
const webhooks_client_max_body_size = `${
  config.webhooks.client_max_body_size / 1000000
}M`;

const locals = {
  host: "blot.im",
  blot_directory: config.blot_directory,
  disable_http2: process.env.DISABLE_HTTP2,
  node_ip: NODE_SERVER_IP,
  node_port: "8088",

  // The maximum size of icloud uploads
  iCloud_max_body_size,

  // The maximum size of webhooks bodies forwarded to the node server
  webhooks_client_max_body_size,

  // used in production by the node application container running inside docker
  // to communicate with the openresty cache purge endpoint on localhost
  openresty_instance_private_ip: process.env.OPENRESTY_INSTANCE_PRIVATE_IP,

  // used in production if we run multiple openresty instances at the same time
  server_label: process.env.SERVER_LABEL || "us",

  config_directory,
  redis: { host: REDIS_IP },

  // used only by the ci test runner since this path changes on github actions
  lua_package_path: process.env.LUA_PACKAGE_PATH,
  user: process.env.OPENRESTY_USER || "ec2-user",
  log_directory:
    process.env.OPENRESTY_LOG_DIRECTORY || "/var/instance-ssd/logs",

  // if you change the cache directory, you must also update the
  // script mount-instance-store.sh
  cache_directory:
    process.env.OPENRESTY_CACHE_DIRECTORY || "/var/instance-ssd/cache",
  ssl_certificate:
    process.env.SSL_CERTIFICATE || "/etc/ssl/private/letsencrypt-domain.pem",
  ssl_certificate_key:
    process.env.SSL_CERTIFICATE_KEY ||
    "/etc/ssl/private/letsencrypt-domain.key",

  NETDATA_PASSWORD,
  NETDATA_USER,
  NETDATA_PORT,
};

// move the previous contents of the data directory to a backup
// so we can compare the new contents with the old
if (fs.existsSync(OUTPUT)) fs.moveSync(OUTPUT, PREVIOUS, { overwrite: true });

fs.emptyDirSync(OUTPUT);

fs.copySync(`${__dirname}/html`, `${OUTPUT}/html`);

fs.readdirSync(CONFIG_DIRECTORY).forEach((file) => {
  // copy lua files to data directory so they are available to nginx
  if (file.endsWith(".lua")) {
    fs.copySync(CONFIG_DIRECTORY + "/" + file, OUTPUT + "/" + file);
  }

  if (!file.endsWith(".conf")) return;

  partials[file] = fs.readFileSync(CONFIG_DIRECTORY + "/" + file, "utf8");
});

const warning = `

# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
# !!!!!!!!!!!   WARNING                                   !!!!!!!!!!!
# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

# Do not edit this file directly

# This file was generated by ../build.js
# Please update the source files in ./conf and run ../build.js

# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
# !!!!!!!!!!!   WARNING                                   !!!!!!!!!!!
# !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

`;

const result = mustache.render(template, locals, partials);

fs.outputFileSync(OUTPUT + "/openresty.conf", warning + result);

// used by the proxy-tests ci action on github
if (process.argv.includes("--skip-confirmation")) {
  console.log("Build complete");
  return process.exit(0);
}

// compare the new contents with the old
const diff = child_process.spawnSync(
  "/opt/homebrew/bin/diff",
  ["--color", "-r", PREVIOUS, OUTPUT],
  { stdio: "inherit" }
);

if (diff.error) {
  console.error(diff.error);
} else {
  // ask the user to confirm the changes
  // if y, exit with success
  // if n, restore the previous contents to the OUTPUT directory
  // and remove the PREVIOUS directory
  // if anything else, ask the user to confirm again

  const readline = require("readline");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = () => {
    rl.question("Do you want to keep these changes? [y/n] ", (answer) => {
      if (answer === "y") {
        console.log("Changes kept. Build complete");
        rl.close();
      } else if (answer === "n") {
        console.log("Changes discarded");
        fs.removeSync(OUTPUT);
        fs.moveSync(PREVIOUS, OUTPUT);
        fs.removeSync(PREVIOUS);
        console.log("Done");
        rl.close();
        // exit with failure
        process.exit(1);
      } else {
        console.log("Please answer 'y' or 'n'");
        question();
      }
    });
  };

  question();
}
