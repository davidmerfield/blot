function isFatal(error) {
  const message = (error && error.message) || "";
  const code = (error && error.code) || "";
  return code === "ERR_SSRF" || message.includes("ERR_BLOCKED_BY_CLIENT");
}

const retry = async (fn, retries = 3, delay = 1000) => {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt} failed:`, error.message);

      if (isFatal(error)) {
        throw error;
      }

      if (attempt >= retries) {
        break;
      }

      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      console.log("Retrying...");
    }
  }

  throw new Error(
    `Failed after ${retries} attempts. Last error: ${lastError.message}`
  );
};

module.exports = retry;
