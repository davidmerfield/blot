var load = require("./load");
var parse = require("./parse");
var fs = require("fs-extra");
var { join } = require("path");

if (require.main === module)
  main(process.argv[2], process.argv[3], console.log, {}, function (err) {
    if (err) throw err;

    process.exit();
  });

function main(sourceFile, output_directory, status, options, callback) {
  (async () => {
    try {
      status("Reading feed settings");
      const { feedUrl } = await fs.readJson(sourceFile);

      if (!feedUrl) throw new Error("Missing feed URL");

      status("Loading feed");
      const $ = await load(feedUrl);

      await fs.emptyDir(output_directory);

      fs.outputFileSync(join(output_directory, "input.xml"), $.html());

      status("Parsing feed");
      parse($, output_directory, status, callback);
    } catch (err) {
      callback(err);
    }
  })();
}

module.exports = main;
