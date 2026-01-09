var parse = require("./parse");
var fs = require("fs-extra");
var async = require("async");

if (require.main === module) {
  var args = process.argv.slice(2);
  var outputDirectory = args.pop();
  var sourceFiles = args;

  console.log("Source files:", sourceFiles);
  console.log("Output directory:", outputDirectory);

  main(sourceFiles, outputDirectory, function (err) {
    if (err) throw err;

    console.log("Finished!");
    process.exit();
  });
}

function main(sourceFiles, outputDirectory, callback) {
  fs.emptyDirSync(outputDirectory);

  async.eachSeries(
    sourceFiles,
    function (sourceFile, next) {
      var json = fs.readJsonSync(sourceFile);

      parse(json, outputDirectory, next);
    },
    callback
  );
}

module.exports = main;
