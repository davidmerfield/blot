const clfdate = require("./clfdate");
const prefix = () => `${clfdate()} flushCache:`;

module.exports = ({
  reverse_proxies,
  requestsPerSecond = 3,
  maxHostsPerPurge = 10,
}) => {
  let queue = new Set(); // Changed to Set to automatically handle duplicates
  let isProcessing = false;
  let lastRequestTime = 0;
  let currentBatchResolvers = [];

  async function add(hosts) {
    return new Promise((resolve, reject) => {
      // Add all hosts to the Set (duplicates will be automatically ignored)
      hosts.forEach((host) => queue.add(host));
      currentBatchResolvers.push({ resolve, reject });
      process();
    });
  }

  async function process() {
    if (isProcessing) return;

    isProcessing = true;

    while (queue.size > 0) {
      console.log(prefix(), "processing", queue.size, "hosts");
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      const minimumGap = 1000 / requestsPerSecond;

      if (timeSinceLastRequest < minimumGap) {
        await new Promise((resolve) =>
          setTimeout(resolve, minimumGap - timeSinceLastRequest)
        );
      }

      // Convert part of the Set to Array for processing
      const hostsBatch = Array.from(queue).slice(0, maxHostsPerPurge);
      // Remove processed hosts from the Set
      hostsBatch.forEach((host) => queue.delete(host));

      try {
        await flushHosts(hostsBatch);

        if (queue.size === 0) {
          // Resolve all promises when the entire queue is processed
          currentBatchResolvers.forEach(({ resolve }) => resolve());
          currentBatchResolvers = [];
        }
      } catch (error) {
        // Reject all promises if there's an error
        currentBatchResolvers.forEach(({ reject }) => reject(error));
        currentBatchResolvers = [];
        queue.clear();
      }

      lastRequestTime = Date.now();
    }

    console.log(prefix(), "done processing, queue is empty");
    isProcessing = false;
  }

  async function flushHosts(hosts) {
    for (const reverse_proxy_url of reverse_proxies) {
      try {
        const url = `${reverse_proxy_url}/purge?${hosts
          .map((host) => `host=${encodeURIComponent(host)}`)
          .join("&")}`;

        console.log(prefix(), "fetching", url);
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error(
            `Failed to flush proxy ${reverse_proxy_url}: ${res.status} ${res.statusText}`
          );
        }

        const text = await res.text();
        console.log(prefix(), text.trim().split("\n").join(" "));
      } catch (error) {
        console.log(prefix(), "failed to flush", reverse_proxy_url);
        console.log(prefix(), error);
        throw error;
      }
    }
  }

  return async (hosts) => {
    // if the host is a string, convert it to an array
    if (typeof hosts === "string") {
      hosts = [hosts];
    }

    // ensure the hosts are an array
    if (!Array.isArray(hosts)) {
      throw new Error("hosts must be a string or an array of strings");
    }

    await add(hosts);
  };
};
