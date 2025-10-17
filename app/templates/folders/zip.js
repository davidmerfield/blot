const async = require("async");
const fs = require("fs-extra");
const archiver = require("archiver");
const config = require("config");
const clfdate = require("helper/clfdate");
const VIEW_DIRECTORY = config.views_directory + "/folders";
const FOLDER_DIRECTORY = __dirname;

const tmp = require("helper/tempDir")();
const cache = {};

const main = () => {
  return new Promise((resolve, reject) => {
    const folders = fs
      .readdirSync(FOLDER_DIRECTORY)
      .filter((i) => i.indexOf(".") === -1);

    async.eachSeries(
      folders,
      (folder, next) => {
        if (cache[folder]) {
          return fs.copy(
            cache[folder],
            VIEW_DIRECTORY + "/" + folder + ".zip",
            next
          );
        }

        const tmpPath = tmp + "folder-zips/" + folder + ".zip";

        if (fs.existsSync(tmpPath)) {
          console.log(clfdate(), folder, "Copying cached ZIP", tmpPath);
          return fs.copy(tmpPath, VIEW_DIRECTORY + "/" + folder + ".zip", next);
        }

        fs.removeSync(tmpPath);

        fs.ensureDirSync(tmp + "folder-zips");

        const output = fs.createWriteStream(tmpPath);

        const archive = archiver("zip", {
          zlib: { level: 9 }, // Sets the compression level.
        });

        output.on("close", function () {
          console.log(
            clfdate(),
            folder,
            archive.pointer() + " total bytes for",
            folder,
            tmpPath
          );
          
          cache[folder] = tmpPath;
          const outputPath = VIEW_DIRECTORY + "/" + folder + ".zip";
          fs.removeSync(outputPath);
          fs.copy(tmpPath, outputPath, next);
        });

        // good practice to catch warnings (ie stat failures and other non-blocking errors)
        archive.on("warning", function (err) {
          if (err.code === "ENOENT") {
            // log warning
          } else {
            // throw error
            reject(err);
          }
        });

        // good practice to catch this error explicitly
        archive.on("error", function (err) {
          reject(err);
        });

        archive.pipe(output);
        archive.directory(FOLDER_DIRECTORY + "/" + folder + "/", false);
        archive.finalize();
      },
      resolve
    );
  });
};

if (require.main === module) {
  main(function (err) {
    if (err) throw err;
    process.exit();
  });
}

module.exports = main;
