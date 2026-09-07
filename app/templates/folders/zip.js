const async = require("async");
const fs = require("fs-extra");
const archiver = require("archiver");
const config = require("config");
const clfdate = require("helper/clfdate");
const VIEW_DIRECTORY = config.views_directory + "/folders";
const FOLDER_DIRECTORY = __dirname;
const MANIFEST_PATH = VIEW_DIRECTORY + "/manifest.json";

const tmp = require("helper/tempDir")();
const cache = {};

const buildFolderTree = (directoryPath, depth = 0, relativePath = "") => {
  return fs.readdirSync(directoryPath).map((name) => {
    const nodePath = directoryPath + "/" + name;
    const stat = fs.statSync(nodePath);
    const normalizedPath = relativePath ? relativePath + "/" + name : name;

    if (stat.isDirectory()) {
      return {
        name,
        type: "directory",
        children: buildFolderTree(nodePath, depth + 1, normalizedPath),
        depth,
        path: normalizedPath,
      };
    }

    return {
      name,
      type: "file",
      children: [],
      depth,
      path: normalizedPath,
    };
  });
};

const buildDisplayTree = (nodes) => {
  return nodes.map((node) => {
    const displayNode = {
      name: node.name,
      type: node.type,
      depth: node.depth,
      path: node.path,
    };

    if (node.type !== "directory") {
      displayNode.children = [];
      return displayNode;
    }

    if (node.depth > 2) {
      displayNode.collapsed = true;
      displayNode.children = [];
      return displayNode;
    }

    displayNode.children = buildDisplayTree(node.children || []);
    return displayNode;
  });
};

const main = () => {
  return new Promise((resolve, reject) => {
    const folders = fs
      .readdirSync(FOLDER_DIRECTORY)
      .filter((i) => i.indexOf(".") === -1)
      .filter((i) => fs.statSync(FOLDER_DIRECTORY + "/" + i).isDirectory());

    const manifest = {};

    async.eachSeries(
      folders,
      (folder, next) => {
        const fullTree = buildFolderTree(FOLDER_DIRECTORY + "/" + folder);
        manifest[folder] = {
          fullTree,
          displayTree: buildDisplayTree(fullTree),
        };

        if (cache[folder]) {
          return fs.copy(
            cache[folder],
            VIEW_DIRECTORY + "/" + folder + ".zip",
            next
          );
        }

        const tmpPath = tmp + "folder-zips/" + folder + ".zip";

        if (config.environment === "development") {
          if (fs.existsSync(tmpPath)) {
            console.log(
              clfdate(),
              folder,
              "Copying cached ZIP since we are in development environment"
            );
            return fs.copy(
              tmpPath,
              VIEW_DIRECTORY + "/" + folder + ".zip",
              next
            );
          }
        }

        fs.removeSync(tmpPath);

        fs.ensureDirSync(tmp + "folder-zips");

        const output = fs.createWriteStream(tmpPath);

        const archive = archiver("zip", {
          zlib: { level: 9 }, // Sets the compression level.
        });

        output.on("close", function () {
          console.log(archive.pointer() + " total bytes for", folder);
          cache[folder] = tmpPath;
          const outputPath = VIEW_DIRECTORY + "/" + folder + ".zip";
          fs.removeSync(outputPath);
          fs.copy(tmpPath, outputPath, next);
        });

        // good practice to catch warnings (ie stat failures and other non-blocking errors)
        archive.on("warning", function (err) {
          console.log(err);

          if (err.code === "ENOENT") {
            // log warning
          } else {
            // throw error
            reject(err);
          }
        });

        // good practice to catch this error explicitly
        archive.on("error", function (err) {
          console.log(err);
          reject(err);
        });

        archive.pipe(output);
        archive.directory(FOLDER_DIRECTORY + "/" + folder + "/", false);
        archive.finalize();
      },
      (err) => {
        if (err) {
          return reject(err);
        }

        fs.ensureDirSync(VIEW_DIRECTORY);
        fs.writeJsonSync(MANIFEST_PATH, manifest, { spaces: 2 });

        resolve();
      }
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
module.exports.buildFolderTree = buildFolderTree;
module.exports.buildDisplayTree = buildDisplayTree;
