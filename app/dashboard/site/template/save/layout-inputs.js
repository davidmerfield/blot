const SORT_OPTIONS = require("../sort-options");

// Mirror the chosen option onto every shape template code might read:
// flat sort_by / sort_order, and a nested sort object (direction and its
// `order` alias) when the template already uses one.
const applySortSelection = (locals, option) => {
  locals.sort_by = option.sort_by;
  locals.sort_order = option.sort_order;

  if (locals.sort && typeof locals.sort === "object") {
    locals.sort.by = option.sort_by;
    locals.sort.direction = option.sort_order;
    if (Object.prototype.hasOwnProperty.call(locals.sort, "order")) {
      locals.sort.order = option.sort_order;
    }
  }
};

module.exports = function (req, res, next) {
  // the user has not clicked on a button in the 'color scheme' list
  if (req.locals.thumbnails_per_row && req.locals.number_of_rows) {
    req.locals.page_size =
      parseInt(req.locals.thumbnails_per_row) *
      parseInt(req.locals.number_of_rows);
  }

  // The Post sorting select posts its own form as `locals.sort_by` carrying a
  // composite value like "date_asc". Only rewrite sorting when that form was
  // submitted (or a leftover composite value is still stored); every other
  // sidebar form must leave the existing sort settings untouched.
  const submitted =
    req.body &&
    (req.body["locals.sort_by"] ??
      (req.body.locals && req.body.locals.sort_by));
  const composite =
    submitted !== undefined
      ? submitted
      : SORT_OPTIONS.some(option => option.value === req.locals.sort_by)
      ? req.locals.sort_by
      : undefined;

  if (composite !== undefined) {
    applySortSelection(req.locals, SORT_OPTIONS.resolve({ value: composite }));
  }

  next();
};
