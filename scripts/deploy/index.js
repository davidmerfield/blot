// Utility functions
const sshCommand = require("./util/sshCommand");
const checkBranch = require("./util/checkBranch");
const getGitCommit = require("./util/getGitCommit");
const checkHealth = require("./util/checkHealth");
const generateDockerCommand = require("./util/generateDockerCommand");

const constants = require("./constants");

const { CONTAINERS } = constants;
const { REGISTRY_URL, PLATFORM_OS } = constants;

const MAX_REMOTE_LOGS = 3;
let remoteTempDirPromise;

async function getRemoteTempDir() {
  // Use /tmp as the default temp directory for log archiving
  // This avoids complex shell commands that are hard to secure
  return "/tmp";
}

async function storeRemoteContainerLogs(containerName, reason) {
  // optional: validate inputs
  const safeName = (s) => {
    if (!/^[a-z0-9][a-z0-9_.-]+$/.test(s))
      throw new Error("Bad container name");
    return s;
  };
  safeName(containerName);

  const timestamp = new Date().toISOString().replace(/[:]/g, "-");
  const remoteTempDir = await getRemoteTempDir();
  const remoteDir = `${remoteTempDir}/blot-deploy-logs/${containerName}`;
  const remotePath = `${remoteDir}/${containerName}-${reason}-${timestamp}.log`;
  const tmpPath = `${remoteDir}/.${containerName}-${reason}-${timestamp}.tmp`;

  // 1) Ensure dir exists
  await sshCommand(`mkdir -p '${remoteDir}'`);

  // 2) Capture logs to a temp file (atomic move later)
  await sshCommand(
    `(docker logs '${containerName}' > '${tmpPath}' 2>&1 || true)`
  );

  // 3) Atomically move into place
  await sshCommand(`mv -f '${tmpPath}' '${remotePath}'`);

  // 4) Compute prune list on server
  const listToDelete = await sshCommand(
    `cd '${remoteDir}' && ls -1t | awk 'NR>${MAX_REMOTE_LOGS}'`
  );

  // 5) Delete old files one by one with full paths and --
  const files = listToDelete
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const f of files) {
    await sshCommand(`rm -f -- '${remoteDir}/${f}'`);
  }

  // 6) Provide a fetch hint
  const fetchCommand = `scp blot:'${remotePath}' ./`;
  return { remotePath, fetchCommand };
}

async function dumpFailedContainerLogs(containerName) {
  const { remotePath, fetchCommand } = await storeRemoteContainerLogs(
    containerName,
    "fail"
  );

  console.log(`Stored failure logs on remote server: ${remotePath}`);
  console.log(`Fetch them locally with:`);
  console.log(fetchCommand);
}

async function archiveContainerLogs(containerName) {
  // Check if container exists by listing containers and checking in Node
  const containers = await sshCommand(
    `docker ps -a --format '{{.Names}}'`
  );
  
  const containerExists = containers
    .split("\n")
    .map((line) => line.trim())
    .includes(containerName);

  if (!containerExists) {
    return null;
  }

  const { remotePath, fetchCommand } = await storeRemoteContainerLogs(
    containerName,
    "deploy"
  );

  return { remotePath, fetchCommand };
}

async function detectPlatform() {
  console.log("Detecting server platform...");
  const platformOs = PLATFORM_OS;
  let platformArch = await sshCommand(
    "docker info --format '{{.Architecture}}'"
  );
  if (platformArch === "aarch64") platformArch = "arm64";
  return { platformOs, platformArch };
}

async function verifyImageManifest(commitHash, platform) {
  try {
    console.log("Checking that an image exists...");
    const manifest = await sshCommand(
      `docker manifest inspect ${REGISTRY_URL}:${commitHash} 2>/dev/null`
    );
    const manifestData = JSON.parse(manifest);
    return manifestData.manifests.some(
      (m) =>
        m.platform.architecture === platform.platformArch &&
        m.platform.os === platform.platformOs
    );
  } catch {
    return false;
  }
}

async function removeContainer(containerName) {
  console.log(`Removing container ${containerName}...`);
  // Check if container exists first, then remove it
  const containers = await sshCommand(
    `docker ps -a --format '{{.Names}}'`
  );
  
  const containerExists = containers
    .split("\n")
    .map((line) => line.trim())
    .includes(containerName);

  if (containerExists) {
    await sshCommand(`docker rm -f ${containerName}`);
  }
}

async function getCurrentImageHash(containerName) {
  try {
    console.log(`Getting current image hash for ${containerName}...`);
    return await sshCommand(
      `docker inspect --format='{{.Config.Image}}' ${containerName} 2>/dev/null | sed 's/.*://'`
    );
  } catch {
    return "";
  }
}

async function deployContainer(container, platform, imageHash) {
  const dockerRunCommand = await generateDockerCommand(
    container,
    platform,
    imageHash
  );

  console.log(`Deploying ${container.name}... with command:`);
  console.log();
  console.log(dockerRunCommand);
  console.log();

  console.log("Pulling new image...");
  await sshCommand(`docker pull ${REGISTRY_URL}:${imageHash}`);

  console.log("Removing running container...");
  try {
    const archivedLogsInfo = await archiveContainerLogs(
      container.name
    );

    if (archivedLogsInfo) {
      console.log(`Archived logs to ${archivedLogsInfo.remotePath}`);
      console.log(`Fetch them locally with: ${archivedLogsInfo.fetchCommand}`);
    } else {
      console.log(
        `No existing container logs to archive for ${container.name}.`
      );
    }
  } catch (logError) {
    console.warn(
      `Failed to archive logs for ${container.name}:`,
      logError.message || logError
    );
  }
  await removeContainer(container.name);
  console.log("Starting new container...");
  await sshCommand(dockerRunCommand);
  console.log("Checking health of new container...");
  await checkHealth(container.name, container.port);
}

async function main() {
  try {
    // Validate arguments
    if (process.argv.length > 3) {
      throw new Error("Too many arguments provided.");
    }

    console.log(
      "When running a deployment, it's helpful to ssh into the server and run in two seperate windows"
    );
    console.log("See live overview of docker containers:");
    console.log("watch 'docker ps' ");
    console.log(
      "Watch traffic to backup servers (ideally this should not happen during deployment):"
    );
    console.log("backup-servers");

    await checkBranch();

    const { commitHash, commitMessage } = await getGitCommit(process.argv[2]);

    console.log(`Deploying image for commit: ${commitHash} - ${commitMessage}`);

    const imageHash = commitHash;
    const platform = await detectPlatform();
    const manifestExists = await verifyImageManifest(imageHash, platform);

    if (!manifestExists) {
      throw new Error(
        `Image for platform ${platform.platformOs}/${platform.platformArch} does not exist.`
      );
    }

    // const askForConfirmation = require("./util/askForConfirmation");
    // const confirmed = await askForConfirmation(
    //   "Are you sure you want to deploy this image? (y/n): "
    // );

    // if (!confirmed) {
    //   console.log("Deployment canceled.");
    //   process.exit(0);
    // }

    // validate that each container has a unique name and port
    const containerNames = Object.values(CONTAINERS).map(
      (container) => container.name
    );
    const uniqueContainerNames = new Set(containerNames);
    if (containerNames.length !== uniqueContainerNames.size) {
      throw new Error("Container names must be unique.");
    }

    const containerPorts = Object.values(CONTAINERS).map(
      (container) => container.port
    );
    const uniqueContainerPorts = new Set(containerPorts);
    if (containerPorts.length !== uniqueContainerPorts.size) {
      throw new Error("Container ports must be unique.");
    }

    console.log("Deploying containers...");
    // Deploy all containers
    for (const container of Object.values(CONTAINERS)) {
      const rollbackHash = await getCurrentImageHash(container.name);

      if (rollbackHash && rollbackHash === imageHash) {
        console.log(
          `Image for ${container.name} is already deployed. Skipping...`
        );
        continue;
      }

      if (rollbackHash) {
        console.log("Determined rollback hash:", rollbackHash);
      } else {
        console.log("No previous image found for rollback.");
      }

      try {
        await deployContainer(container, platform, imageHash);
      } catch (error) {
        console.error(`Deployment failed for ${container.name}`);

        try {
          await dumpFailedContainerLogs(container.name);
        } catch (logError) {
          console.warn(
            `Failed to collect logs for ${container.name}:`,
            logError
          );
        }

        if (!rollbackHash) {
          console.error("No previous image to rollback to. Exiting...");
          throw error;
        }

        console.error("Rolling back...");
        try {
          await deployContainer(container, platform, rollbackHash);
          console.error("Rollback succeeded.");
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError);
        }
        throw error;
      }
    }

    console.log("Pruning old images...");
    const pruned = await sshCommand("docker image prune -af");
    console.log(pruned);
    console.log("Deployment completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  dumpFailedContainerLogs,
  archiveContainerLogs,
  deployContainer,
  main,
};
