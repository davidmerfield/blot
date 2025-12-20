var Template = require("models/template");
var extname = require("path").extname;

module.exports = function (req, res, next) {
  if (req.params.viewSlug === "package.json") {
    const { views, template } = res.locals.getAllViews;

    req.view = res.locals.view = {
      content: Template.package.generate(req.blog.id, template, views),
      name: "package.json",
      isPackageJSON: true,
      editorMode: editorMode("package.json"),
    };

    return next();
  }

  Template.getView(req.template.id, req.params.viewSlug, function (err, view) {
    if (err || !view) return next(new Error("No view"));

    view.editorMode = editorMode(view.name);
    view.isPackageJSON = false;
    req.view = res.locals.view = view;
    next();
  });
};

// Determine the mode for the
// text editor based on the file extension
function editorMode(name) {
  var mode = "htmlmixed";

  if (extname(name) === ".js") mode = "javascript";

  if (extname(name) === ".json") mode = "javascript";

  if (extname(name) === ".css") mode = "css";

  if (extname(name) === ".txt") mode = "text";

  if (extname(name) === ".rss") mode = "xml";

  if (extname(name) === ".xml") mode = "xml";

  return mode;
}
