// N.B. The image deployed should be capable of serving both
// sites and blogs. The difference in configuration is in the
// number of cpus, memory, and maxOldSpaceSize only.

// We need more overhead between maxOldSpaceSize and memory
// for the site servers because they need to run chromium
// and pandoc for building posts. The blog servers don't.
const siteConfig = {
  cpus: 2, // we overcommit cpu slightly
  memory: "1.5g",
  maxOldSpaceSize: 750,
};

// The blog servers only have a single node.js process and 
// also the esbuild process which is much lighter so the
// gap between memory and maxOldSpaceSize can be smaller.
const blogsConfig = {
  cpus: 2,
  memory: "2g",
  maxOldSpaceSize: 1500,
};

module.exports = {
  REGISTRY_URL: "ghcr.io/davidmerfield/blot",
  PLATFORM_OS: "linux",
  LOG_MAX_SIZE: "512mb",
  LOG_MAX_FILE: 1,

  // This is the port each container listens on internally
  // Externally they listen on the port specified in the container
  // configuration and our reverse proxy load balances between them.
  INTERNAL_PORT: 8080,

  // This is the directory which contains all the blog data, static
  // files, etc. It is mounted into each running container so they
  // can all access the same data.
  DATA_DIRECTORY_ON_SERVER: "/var/www/blot/data",
  DATA_DIRECTORY_ON_CONTAINER: "/usr/src/app/data",

  ENV_FILE_ON_SERVER: "/etc/blot/secrets.env",

  CONTAINERS: {
    // Failover server (both sites and blogs)
    BLUE: {
      name: "blot-container-blue",
      port: 8088,
      ...siteConfig,
    },

    // Site server (dashboard, brochure, sync folders)
    GREEN: {
      name: "blot-container-green",
      port: 8089,
      ...siteConfig,
    },

    // Blog server (previews, published blogs)
    YELLOW: {
      name: "blot-container-yellow",
      port: 8090,
      ...blogsConfig,
    },
  },
};
