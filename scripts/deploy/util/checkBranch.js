const execCommand = require("./execCommand");

module.exports = async function checkBranch() {
  // Skip branch check in CI environments (e.g., GitHub Actions)
  if (process.env.SKIP_BRANCH_CHECK === "true") {
    return;
  }

  const currentBranch = execCommand("git rev-parse --abbrev-ref HEAD");
  if (currentBranch !== "master") {
    throw new Error("You must be on the master branch to deploy.");
  }
};
