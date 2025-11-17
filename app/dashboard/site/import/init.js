const fs = require("fs-extra");
const tempDir = require("helper/tempDir")();
const client = require("models/client");
const { join } = require("path");
const archiver = require("archiver");

module.exports = ({ blogID, label }) => {
  const importID = label + "-" + Date.now();

  const importDirectory = join(tempDir, "import", blogID, importID);
  const outputDirectory = join(importDirectory, "output");

  fs.ensureDir(importDirectory);
  fs.ensureDir(outputDirectory);

  const lastStatus = join(importDirectory, "status.txt");

  async function finish() {
    return new Promise(async (resolve, reject) => {
      const archive = archiver("zip");
      const resultWS = fs.createWriteStream(
        join(importDirectory, "result.zip")
      );

      let identifier;

      try {
        identifier = await fs.readFile(
          join(importDirectory, "identifier.txt"),
          "utf-8"
        );
      } catch (e) {
        identifier = importID;
      }
      archive.on("end", () => {
        status("Finished");
        resolve();
      });

      archive.on("error", reject);
      archive.pipe(resultWS);
      archive.directory(outputDirectory, identifier);
      archive.finalize();
    });
  }

  function status(message) {
    console.log("reporting status", message);
    // should write to disk somehow
    client.publish(
      "import:status:" + blogID,
      JSON.stringify({ status: message, importID })
    );
    fs.outputFile(lastStatus, message);
  }

  return { importID, finish, outputDirectory, importDirectory, status };
};
