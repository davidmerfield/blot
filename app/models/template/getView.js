var key = require("./key");
var client = require("models/client");
var deserialize = require("./util/deserialize");
var viewModel = require("./viewModel");

module.exports = function getView(templateID, viewID, callback) {
  var match;

  client.hgetall(key.view(templateID, viewID), function (err, view) {
    if (view) {
      view = deserialize(view, viewModel);
      return callback(err, view);
    }

    client.smembers(key.allViews(templateID), function (err, views) {
      if (err) return callback(err);

      // goal is to find a view whose extension-less name matches
      // so we can do. {{> head}} in templates and retrieve head.html

      views.forEach(function (viewname) {
        var name = viewname.slice(0, viewname.lastIndexOf("."));
        if (name === viewID) match = viewname;
      });

      if (!match) return callback(new Error("No view: " + viewID));

      client.hgetall(key.view(templateID, match), function (err, view) {
        if (!view) return callback(new Error("No view: " + viewID));

        view = deserialize(view, viewModel);
        callback(err, view);
      });
    });
  });
};
