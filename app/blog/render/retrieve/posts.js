const Entries = require("models/entries");

/**
 * Handles rendering of the page with entries and pagination.
 */
module.exports = function (req, res, callback) {
  const blog = req.blog;

  // Parse and validate page size (user input via template)
  const pageSize = parsePageSize(req.template?.locals?.page_size);

  // Parse and validate sort order (user input via template)
  const sortBy = parseSortBy(req.template?.locals?.sort_by);

  // Parse and validate sort order (user input via template)
  const order = parseSortOrder(req.template?.locals?.sort_order);

  // Fetch entries and render the view
  // Pass raw page number input - validation happens in the model
  const rawPageNumber = req.params?.page || '1';
  req.log("Loading entries for page", rawPageNumber, "with page size", pageSize);
  
  Entries.getPage(blog.id, rawPageNumber, pageSize, (error, entries, pagination) => {
    if (error) {
      // Validation error from the model
      if (error.statusCode === 400) {
        req.log("Invalid page number:", error.invalidInput);
        return callback(new Error("Invalid page number"));
      }
      // Other errors
      return callback(error);
    }

    // Guard against missing pagination object (e.g., if Redis fails)
    // Note: pagination.current is already set by the model
    if (pagination && entries && entries.length > 0) {
      entries.at(-1).pagination = pagination;
    }

    callback(null, entries);
  }, { sortBy, order });
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

