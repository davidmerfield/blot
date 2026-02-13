var eachView = require("../each/view");
var Template = require("models/template");

if (require.main === module) {
  main(function (err, stats) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(
      "Done. Recalculated retrieve metadata for",
      stats.updated,
      "views",
      "(skipped",
      stats.skipped + ")"
    );

    process.exit(0);
  });
}

function main(callback) {
  var stats = {
    updated: 0,
    skipped: 0,
  };

  eachView(
    function (user, blog, template, view, next) {
      if (!view || !view.name || !view.content) {
        stats.skipped++;
        return next();
      }

      // Force setView to re-parse template content and rewrite retrieve metadata.
      // setView's short-circuit checks `updates.retrieve` before parsing, so passing
      // a unique marker ensures it proceeds and then replaces retrieve with parse output.
      Template.setView(
        template.id,
        {
          name: view.name,
          content: view.content,
          retrieve: {
            __recalculateRetrieve: Date.now(),
          },
        },
        function (err) {
          if (err) return next(err);

          stats.updated++;
          console.log("Updated", template.id, view.name);
          next();
        }
      );
    },
    function (err) {
      callback(err, stats);
    }
  );
}

module.exports = main;
