const { spawn } = require("child_process");
const path = require("path");

const composeArgs = [
  "-f",
  path.join(__dirname, "docker-compose.yml"),
  "up",
  "--build",
];

const processes = [];

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    ...options,
  });

  processes.push(child);

  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`${command} exited with code ${code}`);
    }
    if (signal) {
      console.log(`${command} received signal ${signal}`);
    }
  });

  return child;
}

spawnProcess("node", [path.join(__dirname, "open-folder-server.js")], {
  env: process.env,
});

const composeEnv = {
  ...process.env,
};

if (composeEnv.COMPOSE_DOCKER_CLI_BUILD == null) {
  composeEnv.COMPOSE_DOCKER_CLI_BUILD = "bake";
}

if (composeEnv.DOCKER_BUILDKIT == null) {
  composeEnv.DOCKER_BUILDKIT = "1";
}

const compose = spawnProcess("docker-compose", composeArgs, {
  env: composeEnv,
});

function shutdown() {
  for (const child of processes) {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGINT");
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

compose.on("exit", (code) => {
  shutdown();
  process.exit(code || 0);
});
