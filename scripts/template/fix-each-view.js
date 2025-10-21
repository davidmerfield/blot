var writeToFolder = require("modules/template").writeToFolder;
var _ = require("lodash");
var eachView = require("../each/view");
var Template = require("models/template");
var async = require("async");
var shouldWrite = {};

// if (require.main === module) {
//   main(
//     function(view, callback) {
//       callback();
//     },
//     function(err) {
//       if (err) return console.error(err);

//       console.log("Fixed all templates!");
//       process.exit();
//     }
//   );
// }

function main(doThis, callback) {
  eachView(
    function (user, blog, template, view, next) {
      if (!view || !view.content) return next();

      var _view = _.cloneDeep(view);

      doThis(view, function (err) {
        if (err) return next(err);

        if (_.isEqual(_view, view)) return next();

        if (template.localEditing) shouldWrite[template.id] = blog.id;
        console.log("Changed", template.id, view.name);
        Template.setView(template.id, view, next);
      });
    },
    function () {
      console.log();
      console.log("Checking to see if any templates need to be written...");
      async.eachOfSeries(
        shouldWrite,
        function (blogID, templateID, next) {
          console.log("Writing", templateID);
          writeToFolder(blogID, templateID, function (err) {
            if (err) console.log(err);

            next();
          });
        },
        callback
      );
    }
  );
}

module.exports = main;
