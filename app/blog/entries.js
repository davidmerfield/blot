const Entries = require("models/entries");

/**
 * Handles rendering of the page with entries and pagination.
 */
module.exports = function (req, res, next) {
  const blog = req.blog;

  // Parse and validate page number (user input)
  const pageNo = parsePageNumber(req.params.page_number);

  // Parse and validate page size (user input via template)
  const pageSize = parsePageSize(req.template?.locals?.page_size);

  // Parse and validate sort order (user input via template)
  const sortBy = parseSortBy(req.template?.locals?.sort_by);

  // Parse and validate sort order (user input via template)
  const order = parseSortOrder(req.template?.locals?.sort_order);

  // Fetch entries and render the view
  req.log("Loading entries for page", pageNo, "with page size", pageSize);
  Entries.getPage(blog.id, pageNo, pageSize, (err, entries, pagination) => {
    if (err) return next(err);
    pagination.current = pageNo;

    res.locals.entries = entries;
    res.locals.pagination = pagination;

    req.log("Rendering entries");
    res.renderView("entries.html", next);
  }, { sortBy, order });
}

/**
 * Utility function to validate and parse the page number.
 * Falls back to 1 if the input is invalid or undefined.
 *
 * @param {string|undefined} pageNumber - The page number from user input.
 * @returns {number} - A valid page number (default: 1).
 */
function parsePageNumber(pageNumber) {
  const parsedPageNumber = parseInt(pageNumber, 10);

  // Ensure the page number is a positive integer; default to 1 if invalid
  if (!isNaN(parsedPageNumber) && parsedPageNumber > 0) {
    return parsedPageNumber;
  }

  return 1; // Default page number
}

/**
 * Utility function to validate and parse the page size.
 * Falls back to a default value if the input is invalid or undefined.
 *
 * @param {string|number|undefined} templatePageSize - Page size from the template (user input).
 * @returns {number} - A valid page size (default: 5).
 */
function parsePageSize(templatePageSize) {
  const defaultPageSize = 5;

  // Attempt to parse and validate template page size (user input)
  const parsedTemplatePageSize = parseInt(templatePageSize, 10);
  if (!isNaN(parsedTemplatePageSize) && parsedTemplatePageSize > 0 && parsedTemplatePageSize <= 100) {
    return parsedTemplatePageSize;
  }

  return defaultPageSize; // Default page size
}


/**
 * Utility function to validate and parse the sort by field.
 * Falls back to a default value if the input is invalid or undefined.
 *
 * @param {string|undefined} templateSortBy - Sort by field from the template (user input).
 * @returns {string} - A valid sort by field (default: "date").
 */
function parseSortBy(templateSortBy) {
  const defaultSortBy = "date";

  // Validate and parse sort by field (user input)
  if (templateSortBy === "id") {
    return templateSortBy;
  }

  return defaultSortBy; // Default sort by field
}

/**
 * Utility function to validate and parse the sort order.
 * Falls back to a default value if the input is invalid or undefined.
 *
 * @param {string|undefined} templateSortOrder - Sort order from the template (user input).
 * @returns {string} - A valid sort order (default: "asc").
 */
function parseSortOrder(templateSortOrder) {
  const defaultSortOrder = "asc";

  // Validate and parse sort order (user input)
  if (templateSortOrder === "asc" || templateSortOrder === "desc") {
    return templateSortOrder;
  }

  return defaultSortOrder; // Default sort order
} 

