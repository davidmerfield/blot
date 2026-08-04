const fs = require("fs-extra");
const tempDir = require("helper/tempDir")();
const client = require("models/client");
const { join } = require("path");
const archiver = require("archiver");

module.exports = async ({ blogID, label }) => {
  const importID = label + "-" + Date.now();

  const importDirectory = join(tempDir, "import", blogID, importID);
  const outputDirectory = join(importDirectory, "output");

  await fs.ensureDir(importDirectory);
  await fs.ensureDir(outputDirectory);

  const lastStatus = join(importDirectory, "status.txt");

  async function finish() {
    if (await isCancelled()) return false;

    const resultPath = join(importDirectory, "result.zip");

    let identifier;

    try {
      identifier = await fs.readFile(
        join(importDirectory, "identifier.txt"),
        "utf-8"
      );
    } catch (e) {
      identifier = importID;
    }

    try {
      await new Promise((resolve, reject) => {
        const archive = archiver("zip");
        const resultWS = fs.createWriteStream(resultPath);
        let settled = false;

        const fail = (err) => {
          if (settled) return;
          settled = true;
          archive.abort();
          resultWS.destroy();
          reject(err);
        };

        resultWS.on("close", () => {
          if (settled) return;
          settled = true;
          resolve();
        });
        resultWS.on("error", fail);
        archive.on("error", fail);
        archive.on("warning", fail);
        try {
          archive.pipe(resultWS);
          archive.directory(outputDirectory, identifier);
          archive.finalize().catch(fail);
        } catch (err) {
          fail(err);
        }
      });
    } catch (err) {
      await fs.remove(resultPath);
      throw err;
    }

    // Cancellation may have arrived while the archive was being written.
    if (await isCancelled()) {
      await fs.remove(resultPath);
      return false;
    }

    status("Finished");
    return true;
  }

  async function isCancelled() {
    return fs.pathExists(join(importDirectory, "cancelled.txt"));
  }

  function status(message) {
    console.log("reporting status", message);
    // should write to disk somehow
    client
      .publish(
        "import:status:" + blogID,
        JSON.stringify({ status: message, importID })
      )
      .catch((err) => console.error("failed to publish import status", err));
    fs.outputFile(lastStatus, message);
  }

  return {
    importID,
    finish,
    outputDirectory,
    importDirectory,
    status,
    isCancelled,
  };
};
