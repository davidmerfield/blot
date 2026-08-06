const fs = require("fs-extra");
const tempDir = require("helper/tempDir")();
const client = require("models/client");
const { join } = require("path");
const archiver = require("archiver");

module.exports = ({ blogID, label }) => {
  const importID = label + "-" + Date.now();

  const importDirectory = join(tempDir, "import", blogID, importID);
  const outputDirectory = join(importDirectory, "output");

  // Expose the initialization barrier so route handlers can guarantee that no
  // converter starts writing before both directories exist.
  const ready = Promise.all([
    fs.ensureDir(importDirectory),
    fs.ensureDir(outputDirectory),
  ]);

  const lastStatus = join(importDirectory, "status.txt");

  async function finish() {
    await ready;
    let identifier;
    try {
      identifier = await fs.readFile(
        join(importDirectory, "identifier.txt"),
        "utf-8"
      );
    } catch (e) {
      identifier = importID;
    }

    return new Promise((resolve, reject) => {
      const archive = archiver("zip");
      const resultWS = fs.createWriteStream(
        join(importDirectory, "result.zip")
      );

      let settled = false;
      const fail = async (error) => {
        if (settled) return;
        settled = true;
        try {
          await fs.outputFile(
            join(importDirectory, "error.txt"),
            error && error.message ? error.message : String(error)
          );
          await status("Failed");
        } catch (statusError) {
          console.error("Failed to record archive error", statusError);
        }
        reject(error);
      };
      // archiver's `end` means it has stopped producing bytes. The writable's
      // `close` is the point at which result.zip is safe to download.
      resultWS.on("close", async () => {
        if (settled) return;
        try {
          await status("Finished");
          settled = true;
          resolve();
        } catch (error) {
          fail(error);
        }
      });
      resultWS.on("error", fail);
      archive.on("error", fail);
      archive.pipe(resultWS);
      archive.directory(outputDirectory, identifier);
      Promise.resolve(archive.finalize()).catch(fail);
    });
  }

  async function status(message) {
    console.log("reporting status", message);
    // should write to disk somehow
    client
      .publish(
        "import:status:" + blogID,
        JSON.stringify({ status: message, importID })
      )
      .catch((err) => console.error("failed to publish import status", err));
    await ready;
    await fs.outputFile(lastStatus, message);
  }

  return { importID, finish, outputDirectory, importDirectory, ready, status };
};
