
const SORT_OPTIONS = require("../sort-options");

const DEFAULT_SORT = {
  sort_by: "date",
  sort_order: "desc"
};

const resolveSortSelection = locals => {
  const matchedByValue = SORT_OPTIONS.find(
    option => option.value === locals.sort_by
  );

  if (matchedByValue) {
    return matchedByValue;
  }

  const matchedByStoredSort = SORT_OPTIONS.find(
    option =>
      option.sort_by === locals.sort_by && option.sort_order === locals.sort_order
  );

  if (matchedByStoredSort) {
    return matchedByStoredSort;
  }

  return SORT_OPTIONS.find(
    option =>
      option.sort_by === DEFAULT_SORT.sort_by &&
      option.sort_order === DEFAULT_SORT.sort_order
  );
};

module.exports = function (req, res, next) {
  // the user has not clicked on a button in the 'color scheme' list
  if (req.locals.thumbnails_per_row && req.locals.number_of_rows) {
    req.locals.page_size =
      parseInt(req.locals.thumbnails_per_row) *
      parseInt(req.locals.number_of_rows);
  }

  const sortSelection = resolveSortSelection(req.locals);
  if (sortSelection) {
    req.locals.sort_by = sortSelection.sort_by;
    req.locals.sort_order = sortSelection.sort_order;
  } else {
    req.locals.sort_by = DEFAULT_SORT.sort_by;
    req.locals.sort_order = DEFAULT_SORT.sort_order;
  }

  next();
};
