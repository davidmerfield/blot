// This script will find an <item> or blog post inside a Wordpress export
// file and generate a new test case for it inside /tests/tidy.

var fs = require("fs-extra");
var parseXML = require("xml2js").parseString;

var sourceFile = process.argv[2];
var filter = process.argv[3];
var testsDirectory = require("path").resolve(__dirname + "/../tests/tidy");

if (!sourceFile || !filter)
  throw new Error(
    "Please pass source export file as first argument and filter for <item> as second argument"
  );

parseXML(fs.readFileSync(sourceFile, "utf-8"), function (err, result) {
  var candidates = result.rss.channel[0].item.filter(function (item) {
    return (
      item.title[0].toLowerCase().indexOf(filter.toLowerCase()) > -1 ||
      digest(item.title[0]) === filter
    );
  });

  if (!candidates.length)
    throw new Error('No item titles matched "' + filter + '"');

  if (candidates.length > 1) {
    console.log(
      'Multiple item titles matched "' +
        filter +
        '". Please select one of the following:'
    );

    candidates.forEach(function (item, i) {
      console.log();
      console.log(++i + ". " + item.title[0]);
      console.log(
        "node scripts/generate-test.js " +
          process.argv[2] +
          " " +
          digest(item.title[0])
      );
    });

    return process.exit();
  }

  var title = candidates[0].title[0];
  var folder = testsDirectory + "/" + digest(title);
  var path = folder + "/input.txt";

  fs.outputFileSync(path, candidates[0]["content:encoded"][0]);
  fs.outputFileSync(folder + "/result.txt", "REPLACE");

  console.log('Generated new test for "' + title + '" in:');
  console.log(folder);
});

function digest(str) {
  return require("crypto")
    .createHash("md5")
    .update(str)
    .digest("hex")
    .slice(0, 7);
}
