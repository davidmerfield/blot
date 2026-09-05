const determine_input = require("./util/determine-input");
const getTemplateSortOptions = require("blog/sortOptions");
const SORT_OPTIONS = require("../sort-options");
const DEFAULT_SORT = SORT_OPTIONS.DEFAULT;

const MAP = {
  page_size: {
    label: "Posts per page",
    min: 1,
    max: 60
  }
};

const SORT_INPUT_KEYS = {
  sort: true,
  sort_by: true,
  sort_order: true,
  sort_by_options: true,
  sort_order_options: true
};

const getAvailableSortOptions = locals => {
  const sortByOptions = locals?.sort_by_options;

  if (!Array.isArray(sortByOptions) || !sortByOptions.length) {
    return SORT_OPTIONS;
  }

  const allowed = new Set(sortByOptions);
  const filtered = SORT_OPTIONS.filter(option => allowed.has(option.sort_by));

  return filtered.length ? filtered : SORT_OPTIONS;
};

const resolveSortValue = (locals, available) => {
  const sortOptions = getTemplateSortOptions(locals);
  const sortBy = sortOptions.sortBy || DEFAULT_SORT.sort_by;
  const sortOrder = sortOptions.order || DEFAULT_SORT.sort_order;
  const matched = available.find(
    option => option.sort_by === sortBy && option.sort_order === sortOrder
  );

  return matched ? matched.value : available[0].value;
};

const buildSortControl = locals => {
  const available = getAvailableSortOptions(locals);
  const selectedValue = resolveSortValue(locals, available);

  return {
    key: "sort_by",
    label: "Post sorting",
    value: selectedValue,
    isSelect: true,
    options: available.map(option => ({
      label: option.label,
      value: option.value,
      selected: option.value === selectedValue ? "selected" : ""
    }))
  };
};

module.exports = function (req, res, next) {
  // Every template gets the combined "Post sorting" select, so this runs even
  // for templates whose locals expose none of the other index/layout keys.
  const locals = req.template.locals || {};

  const inputs = Object.keys(locals)

    // If the template uses the thumbnails per row
    // option then hide the page size option
    .filter(key =>
      locals.thumbnails_per_row !== undefined
        ? key !== "page_size"
        : true
    )

    .filter(
      key =>
        key.indexOf("_navigation") === -1 && key.indexOf("navigation_") === -1
    )

    // The combined post-sorting control covers these keys
    .filter(key => !SORT_INPUT_KEYS[key])

    .filter(
      key =>
        [
          "page_size",
          "spacing_size",
          "spacing",
          "thumbnails_per_row",
          "number_of_rows"
        ].indexOf(key) > -1 ||
        (typeof locals[key] === "boolean" &&
          ["hide_dates"].indexOf(key) === -1) ||
        (key.indexOf("_range") === -1 &&
          locals[key + "_range"] &&
          locals[key + "_range"].constructor === Array) ||
        (key.indexOf("_options") === -1 &&
          locals[key + "_options"] &&
          locals[key + "_options"].constructor === Array)
    )
    .map(key => determine_input(key, locals, MAP))
    .filter(i => i);

  inputs.push(buildSortControl(locals));

  res.locals.index_page = inputs;

  return next();
};
