const determine_input = require("./util/determine-input");

const MAP = {
  page_size: {
    label: "Posts per page",
    min: 1,
    max: 60
  }
};

module.exports = function (req, res, next) {
  res.locals.index_page = Object.keys(req.template.locals)

    // If the template uses the thumbnails per row
    // option then hide the page size option
    .filter(key =>
      req.template.locals.thumbnails_per_row !== undefined
        ? key !== "page_size"
        : true
    )

    .filter(
      key =>
        key.indexOf("_navigation") === -1 && key.indexOf("navigation_") === -1
    )

    .filter(
      key =>
        [
          "page_size",
          "spacing_size",
          "spacing",
          "thumbnails_per_row",
          "number_of_rows"
        ].indexOf(key) > -1 ||
        (typeof req.template.locals[key] === "boolean" &&
          ["hide_dates"].indexOf(key) === -1) ||
        (key.indexOf("_range") === -1 &&
          req.template.locals[key + "_range"] &&
          req.template.locals[key + "_range"].constructor === Array) ||
        (key.indexOf("_options") === -1 &&
          req.template.locals[key + "_options"] &&
          req.template.locals[key + "_options"].constructor === Array)
    )
    .map(key => determine_input(key, req.template.locals, MAP))
    .filter(i => i);

  return next();
};
