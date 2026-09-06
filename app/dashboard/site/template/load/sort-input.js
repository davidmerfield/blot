const getTemplateSortOptions = require("blog/sortOptions");
const SORT_OPTIONS = require("../sort-options");

// The "Post sorting" select governs every post listing — index page, tag pages,
// search results and feeds — so it is built here as its own control rather than
// alongside the index-page layout inputs.

const availableOptions = locals => {
  const allowed = locals?.sort_by_options;

  if (!Array.isArray(allowed) || !allowed.length) return SORT_OPTIONS;

  const filtered = SORT_OPTIONS.filter(option => allowed.includes(option.sort_by));
  return filtered.length ? filtered : SORT_OPTIONS;
};

const buildSortControl = locals => {
  const options = availableOptions(locals);
  const { sortBy, order } = getTemplateSortOptions(locals);
  const selected = SORT_OPTIONS.resolve({ sort_by: sortBy, sort_order: order });
  const selectedValue = options.includes(selected)
    ? selected.value
    : options[0].value;

  return {
    key: "sort_by",
    label: "Order",
    value: selectedValue,
    isSelect: true,
    options: options.map(option => ({
      label: option.label,
      value: option.value,
      selected: option.value === selectedValue ? "selected" : ""
    }))
  };
};

module.exports = function (req, res, next) {
  res.locals.post_sorting = buildSortControl(req.template.locals || {});
  return next();
};
