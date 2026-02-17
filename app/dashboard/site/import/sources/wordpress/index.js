var fs = require("fs-extra");
var async = require("async");
var parseXML = require("xml2js").parseString;
var colors = require("colors/safe");
var Item = require("./item");

if (require.main === module) {
  var options = {};
  var outputDirectory = process.argv[3];
  var sourceFile = process.argv[2];

  options.filter = process.argv[4];

  if (!outputDirectory || !sourceFile.length) {
    console.log(
      "Please pass XML export file to convert and directory to output result:"
    );
    return console.log(
      "node index.js export.xml output-directory [filter-item-by-title]"
    );
  }

  console.log(colors.dim("Starting Wordpress import from"), sourceFile);
  console.log(colors.dim("Output directory:"), outputDirectory);

  main(sourceFile, outputDirectory, console.log, options, function (err) {
    if (err) throw err;

    console.log();
    console.log("Finished!");
    process.exit();
  });
}

function main(sourceFile, outputDirectory, status, options, callback) {
  fs.emptyDirSync(outputDirectory);

  status("Reading Wordpress XML file");

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

      try {
        var channel = result.rss.channel[0];
        console.log('HERE with channel', channel);
        var title = channel && channel.title && channel.title[0];
        var link = channel && channel.link && channel.link[0];
        var exportVersion = channel && channel["wp:wxr_version"] && channel["wp:wxr_version"][0];
        
        console.log(title);
        console.log(colors.dim("Site URL:"), link);
        console.log(
          colors.dim("Export Version"),
          exportVersion
        );

        // If you want to see other properties available,
        // log this to STDOUT
        // console.log(result.rss.channel);

        if (options.filter) {
          console.log("filter by:", options.filter);
          channel.item = channel.item.filter(
            function (item) {
              return (
                item.title[0]
                  .toLowerCase()
                  .indexOf(options.filter.toLowerCase()) > -1
              );
            }
          );
        }

        var items = channel.item;

        var totalItems = items.length;
      } catch (e) {
        console.log("HERE with err", e);
        return callback(new Error("Invalid XML"));
      }

      async.eachOfSeries(
        items,
        function (item, index, done) {
          status(
            "Processing " +
              (++index + " of " + totalItems) +
              " " +
              item.title[0].trim()
          );
          console.log(
            colors.dim(++index + "/" + totalItems),
            item.title[0].trim()
          );
          injectAttachedThumbnail(item, channel.item);
          Item(item, outputDirectory, done);
        },
        callback
      );
    });
  });
}

// This will find 'attached' thumbnails that are not part of the
// body of the post itself, then add them to it.
function injectAttachedThumbnail(item, channel) {
  try {
    let thumbnail_id = item["wp:postmeta"].filter(
      (el) => el["wp:meta_key"] && el["wp:meta_key"][0] === "_thumbnail_id"
    )[0]["wp:meta_value"][0];

    let thumbnail = channel.filter((el) => {
      // console.log(el);
      return el["wp:post_id"][0] === thumbnail_id;
    })[0];

    let thumbnail_url = thumbnail.guid[0]._;
    let thumbnail_title = thumbnail.title[0] || thumbnail["content:encoded"][0];

    if (item["content:encoded"][0].indexOf(thumbnail_url) > -1) return;

    let new_html = `<img src="${thumbnail_url}" alt="${thumbnail_title}">`;

    if (item["content:encoded"][0].indexOf("<p>") > -1) {
      new_html = "<p>" + new_html + "</p>";
    }

    item["content:encoded"][0] = new_html + item["content:encoded"][0];
  } catch (e) {
    // do nothing if you can't find a thumbnail
  }
}

module.exports = main;
