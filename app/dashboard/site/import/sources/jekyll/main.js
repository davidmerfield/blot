var fs = require("fs-extra");
var klaw = require("klaw");
var async = require("async");
var determinePath = require("./determinePath");
var extractDate = require("./extractDate");
var extractContent = require("./extractContent");
var extractMetadata = require("./extractMetadata");
var fetchAssets = require("./fetchAssets");
var downloadImages = require("./downloadImages");
var handleIncludes = require("./handleIncludes");

if (require.main === module) {
  main(process.argv[2], process.argv[3], function (err) {
    if (err) throw err;
    console.log("Built!");
    process.exit();
  });
}

function main(sourceDirectory, outputDirectory, callback) {
  var warnings = {};
  var paths = [];

  console.log("Extracting posts from", sourceDirectory, "to", outputDirectory);

  fs.emptyDirSync(outputDirectory);

  klaw(sourceDirectory + "/_posts")
    .on("data", function (item) {
      var extname = require("path").extname(item.path);

      if (extname == ".md") paths.push(item.path);
    })
    .on("end", function () {
      console.log("ended!", paths);

      async.eachSeries(
        paths,
        function (path, next) {
          var tasks = [
            loadFile,
            extractContent,
            extractDate,
            extractMetadata,
            determinePath,
            fetchAssets,
            downloadImages,
            handleIncludes,
          ];

          function loadFile(callback) {
            fs.readFile(path, "utf8", function (err, source) {
              var result = {
                name: require("path").basename(path),
                warnings: [],
                sourceDirectory: sourceDirectory,
                outputDirectory: outputDirectory,
                source: source,
              };
              callback(err, result);
            });
          }

          async.waterfall(tasks, function (err, result) {
            var output = [];

            if (!result) {
              console.log("No result for ", result.name);
              return next();
            }

            if (result.metadata) {
              for (var i in result.metadata) {
                output.push(i + ": " + result.metadata[i]);
              }

              output.push("");
            }

            output.push("# " + result.title);
            output.push("");

            output.push(result.content);

            output = output.join("\n");

            if (result.assets) {
              result.path = result.pathWithAssets;
            } else {
              result.path = result.pathWithoutAssets;
            }

            if (result.warnings.length) {
              warnings[result.name] = result.warnings;
            }

            // } console.warn('Missing handlers', result.missingHandlers);

            // if I need to debug something, write the source file too
            // fs.outputFileSync(result.path + '.source.md', result.source);
            fs.outputFileSync(result.path, output);

            next();

            // date = result[0];
            // metadata = result[1];

            // result = metadataString.join("\n") + "\n\n" + result;

            // var content = sourceFile.split("---")[2];

            // result += "\n" + content.trim();
            // console.log(output);

            // console.log(
            //   "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~  Input >"
            // );
            // console.log(result.source);
            // console.log(
            //   "~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Output >"
            // );
            // console.log(output);
            // console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
            // console.log(result.date.format("YYYY-MM-DD"), name);
          });
        },
        function (err) {
          if (err) return callback(err);

          console.log("Warnings:", warnings);
          callback();
        }
      );
    });
}

module.exports = main;
