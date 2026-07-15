var fs = require("fs-extra");
var dataDir = require("./dataDir");

module.exports = async function renameRepo(formerHandle, latestHandle) {
  if (!formerHandle || !latestHandle || formerHandle === latestHandle) return;

  var formerPath = dataDir + "/" + formerHandle + ".git";
  var latestPath = dataDir + "/" + latestHandle + ".git";

  var formerExists = await fs.pathExists(formerPath);
  if (!formerExists) return;

  var latestExists = await fs.pathExists(latestPath);
  if (latestExists) return;

  try {
    await fs.move(formerPath, latestPath);
  } catch (err) {
    throw new Error(
      "Failed to rename git repository from " +
        formerHandle +
        " to " +
        latestHandle +
        ": " +
        err.message
    );
  }
};
