var eachView = require("../each/view");
var Template = require("template");
var mime = require("mime-types");

if (require.main === module) {
  main(
    function (view, callback) {
      callback();
    },
    function (err) {
      if (err) return console.error(err);

      console.log("Fixed all templates!");
      process.exit();
    }
  );
}

// we shouldn't need to write this change to the user's folder
// make sure this works with local templates
function main(doThis, callback) {
  eachView(function (user, blog, template, view, next) {
    if (!view || !view.content || !view.type) return next();

    var oldName, extension, altExtension;

    if (view.type) {
      oldName = view.name;
      extension = mime.extension(view.type);

      if (view.url && view.url.indexOf(".") > -1) {
        altExtension = view.url.slice(view.url.lastIndexOf(".") + 1);
        if (altExtension !== extension && view.type === "application/xml")
          extension = altExtension;
        // console.log(
        //   "View:",
        //   view.name,
        //   "consider",
        //   altExtension,
        //   " as alternative extension to",
        //   extension, 'for', view.type
        // );
      }

      view.name = view.name + "." + extension;
      delete view.type;
    }

    if (view.name === oldName || !view.name || !oldName) return next();

    console.log(oldName, ">>", view.name);

    Template.setView(template.id, view, function (err) {
      if (err) return next(err);
      Template.dropView(template.id, oldName, next);
    });
  }, callback);
}

module.exports = main;
