const retry = async (fn, retries = 3, delay = 1000) => {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt} failed:`, error.message);

      if (attempt < retries) {
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        console.log("Retrying...");
      } else {
        console.log("No more retries left.");
      }
    }
  }

  throw new Error(
    `Failed after ${retries} attempts. Last error: ${lastError.message}`
  );
};

module.exports = retry;
