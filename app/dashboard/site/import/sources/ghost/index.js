var load = require("./load");
var parse = require("./parse");
var fs = require("fs-extra");

if (require.main === module)
  main(process.argv[2], process.argv[3], function (err) {
    if (err) throw err;

    process.exit();
  });

function main(source_file, source_domain, callback) {
  if (!callback) throw new Error("Please pass a callback");

  if (!source_file)
    return callback(
      new Error("Please pass a source file as a second argument")
    );

  if (!source_domain)
    return callback(
      new Error("Please pass a source domain as a fourth argument")
    );

  const output_directory = source_file.slice(0, source_file.lastIndexOf('.'));
  
  load(source_file, function (err, blog) {
    if (err) return callback(err);

    fs.emptyDir(output_directory, function (err) {
      if (err) return callback(err);

      parse(blog, output_directory, source_domain, callback);
    });
  });
}

module.exports = main;
