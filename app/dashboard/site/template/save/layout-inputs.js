const SORT_OPTIONS = require("../sort-options");
const DEFAULT_SORT = SORT_OPTIONS.DEFAULT;

const findOptionByValue = value =>
  SORT_OPTIONS.find(option => option.value === value);

const getSubmittedSortValue = req => {
  const body = req.body;
  if (!body) return undefined;
  if (Object.prototype.hasOwnProperty.call(body, "locals.sort_by")) {
    return body["locals.sort_by"];
  }
  if (body.locals && Object.prototype.hasOwnProperty.call(body.locals, "sort_by")) {
    return body.locals.sort_by;
  }
  return undefined;
};

const applySortSelection = (locals, selection) => {
  locals.sort_by = selection.sort_by;
  locals.sort_order = selection.sort_order;

  if (locals.sort && typeof locals.sort === "object") {
    locals.sort.by = selection.sort_by;
    locals.sort.direction = selection.sort_order;
  }
};

module.exports = function (req, res, next) {
  // the user has not clicked on a button in the 'color scheme' list
  if (req.locals.thumbnails_per_row && req.locals.number_of_rows) {
    req.locals.page_size =
      parseInt(req.locals.thumbnails_per_row) *
      parseInt(req.locals.number_of_rows);
  }

  // Each sidebar control posts its own form. Only rewrite sorting when the
  // combined select was submitted, or when a leftover composite value is stored.
  const fromBody = getSubmittedSortValue(req);
  const candidate = fromBody !== undefined ? fromBody : req.locals.sort_by;
  const submitted = findOptionByValue(candidate);

  if (fromBody !== undefined) {
    applySortSelection(
      req.locals,
      submitted || {
        sort_by: DEFAULT_SORT.sort_by,
        sort_order: DEFAULT_SORT.sort_order
      }
    );
  } else if (submitted) {
    applySortSelection(req.locals, submitted);
  }

  next();
};
