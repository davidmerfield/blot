var fs = require("fs-extra");
var parseXML = require("xml2js").parseString;
var colors = require("colors/safe");
var async = require("async");
var parse = require("./parse");

if (require.main === module) {
  var options = {};
  var sourceFile = process.argv[2];
  var outputDirectory = sourceFile.slice(0, sourceFile.lastIndexOf("."));

  options.filter = process.argv[4];

  if (!sourceFile.length) {
    console.log("Please pass XML export file to convert:");
    return console.log("node index.js export.xml");
  }

  console.log(colors.dim("Starting Wordpress import from"), sourceFile);
  console.log(colors.dim("Output directory:"), outputDirectory);

  main(sourceFile, outputDirectory, options, function (err) {
    if (err) throw err;

    console.log();
    console.log("Finished!");
    process.exit();
  });
}

function main(sourceFile, outputDirectory, options, callback) {
  fs.emptyDirSync(outputDirectory);

  fs.readFile(sourceFile, "utf-8", function (err, xml) {
    if (err) return callback(err);

    // Without strict:false, sometimes we run into errors with invalid/unescaped
    // characters in the XML provided by Wordpress.
    // Strict seems to have some side-effects, which is why we also normalize:true
    // and normalizeTags:true.
    parseXML(xml, { strict: false, normalizeTags: true }, function (
      err,
      result
    ) {
      if (err) return callback(err);
      //  http://schemas.google.com/blogger/2008/kind#template
      // http://schemas.google.com/blogger/2008/kind#settings
      let posts = result.feed.entry.filter(
        (entry) =>
          entry.category[0].$.TERM ===
          "http://schemas.google.com/blogger/2008/kind#post"
      );

      let index = 0;
      let totalItems = posts.length;
      async.eachSeries(
        posts,
        function (item, next) {
          console.log(colors.dim(++index + "/" + totalItems), item.title[0]._);
          parse(outputDirectory)(item, next);
        },
        callback
      );
    });
  });
}

module.exports = main;
