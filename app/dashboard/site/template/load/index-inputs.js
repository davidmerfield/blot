const determine_input = require("./util/determine-input");

const SORT_OPTIONS = require("../sort-options");

const DEFAULT_SORT = {
  sort_by: "date",
  sort_order: "desc"
};

const MAP = {
  page_size: {
    label: "Posts per page",
    min: 1,
    max: 60
  }
};

const resolveSortValue = locals => {
  const sortBy = locals.sort_by || DEFAULT_SORT.sort_by;
  const sortOrder = locals.sort_order || DEFAULT_SORT.sort_order;
  const matched = SORT_OPTIONS.find(
    option => option.sort_by === sortBy && option.sort_order === sortOrder
  );

  return matched ? matched.value : SORT_OPTIONS[0].value;
};

const buildSortControl = locals => {
  const selectedValue = resolveSortValue(locals);

  return {
    key: "sort_by",
    label: "Post sorting",
    value: selectedValue,
    isSelect: true,
    options: SORT_OPTIONS.map(option => ({
      label: option.label,
      value: option.value,
      selected: option.value === selectedValue ? "selected" : ""
    }))
  };
};

module.exports = function (req, res, next) {
  const inputs = Object.keys(req.template.locals)

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

  inputs.push(buildSortControl(req.template.locals));

  res.locals.index_page = inputs;

  return next();
};
