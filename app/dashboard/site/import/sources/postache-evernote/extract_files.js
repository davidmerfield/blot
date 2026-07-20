var eachEl = require("dashboard/importer/helper").each_el;
var cheerio = require("cheerio");
var fs = require("fs-extra");

module.exports = function ($, output_directory, callback) {
  var files = {};

  eachEl(
    $,
    "resource",
    function (el, next) {
      // data is here
      var encoding = $(el).find("data").attr("encoding");
      var size = $(el).find("data").html().length;
      var hash_id, $recognition;

      var recognition = $(el).find("recognition").html();

      // This doesn't work for the PDF in one of the posts
      // Can we generate the hash in our own way?
      if (recognition) {
        if (recognition.indexOf("<![CDATA[") === 0)
          recognition = recognition.slice("<![CDATA[".length, -3);

        $recognition = cheerio.load(recognition, { xmlMode: true });
        hash_id = $recognition("recoIndex").attr("objID");
      }

      var data = Buffer.from($(el).find("data").html(), encoding);

      // There are also height, width and <recognition>
      // properties. <recognition> contains strange xml?
      // Also duration, in case the file is a movie?
      var mime_type = $(el).find("mime").text();
      var timestamp = $(el).find("timestamp").text();
      var file_name = $(el).find("file-name").text();

      if (!file_name)
        file_name =
          (hash_id || size) + "." + mime_type.slice(mime_type.indexOf("/") + 1);

      file_name = "_" + file_name;

      var relative_path = "/.tmp/" + file_name;
      var file_path = output_directory + relative_path;

      // These media are not neccessarily images, some in this site are PDFs
      // so I think I should generate a dictionary of HTMl tags embedding the
      // media in the appropriate way, stored against the media's hash
      fs.outputFile(file_path, data, function (err) {
        if (err) return callback(err);

        console.log(
          "RESOURCE",
          hash_id,
          timestamp,
          encoding,
          mime_type,
          size,
          file_name
        );

        files[hash_id || file_name] = { name: file_name, path: file_path };

        next();
      });
    },
    function () {
      console.log("here!");
      callback(null, files);
    }
  );
};
