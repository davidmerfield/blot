var eachView = require("../each/view");
var async = require("async");
var Template = require("models/template");
var templateKey = require("models/template/key");
var redis = require("models/client");

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

  // Blog-owned template views.
  eachView(
    function (user, blog, template, view, next) {
      recalcView(template.id, view, stats, next);
    },
    function (err) {
      if (err) return callback(err, stats);

      // Bundled SITE:* templates are used directly by blogs but are skipped
      // by scripts/each - iterate them explicitly so their views also pick
      // up field projection metadata.
      eachSiteView(
        function (templateID, view, next) {
          recalcView(templateID, view, stats, next);
        },
        function (err) {
          callback(err, stats);
        }
      );
    }
  );
}

function recalcView(templateID, view, stats, next) {
  if (!view || !view.name || !view.content) {
    stats.skipped++;
    return next();
  }

  // Force setView to re-parse template content and rewrite retrieve
  // metadata. setView short-circuits when content and retrieve are
  // unchanged, so pass a sentinel retrieve object. setView drops the
  // sentinel and rebuilds retrieve from the parser, preserving user
  // options such as includeDraft and filters.
  Template.setView(
    templateID,
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
      console.log("Updated", templateID, view.name);
      next();
    }
  );
}

function eachSiteView(iterator, done) {
  redis
    .sMembers(templateKey.blogTemplates("SITE"))
    .then(function (templateIDs) {
      async.eachSeries(
        templateIDs || [],
        function (templateID, nextTemplate) {
          Template.getAllViews(templateID, function (err, views) {
            if (err) return nextTemplate(err);

            async.eachOfSeries(
              views || {},
              function (view, name, nextView) {
                iterator(templateID, view, nextView);
              },
              nextTemplate
            );
          });
        },
        done
      );
    })
    .catch(done);
}

module.exports = main;
