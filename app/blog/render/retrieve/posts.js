const Entries = require("models/entries");

/**
 * Handles rendering of the page with entries and pagination.
 */
module.exports = function (req, res, callback) {
  const blogID = req?.blog?.id;

  // Parse and validate page size (user input via template)
  const pageSize = parsePageSize(req?.template?.locals?.page_size);

  // Fetch entries and render the view
  // Pass raw page number input - validation happens in the model
  const pageNumber = req?.params?.page;

  // Pass raw sortBy and order - validation happens in the model
  const sortBy = req?.template?.locals?.sort_by;
  const order = req?.template?.locals?.sort_order;

  Entries.getPage(
    blogID,
    { sortBy, order, pageNumber, pageSize },
    (err, entries) => {
      if (err) {
        return callback(err);
      }

      callback(null, entries);
    }
  );
};

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
  if (
    !isNaN(parsedTemplatePageSize) &&
    parsedTemplatePageSize > 0 &&
    parsedTemplatePageSize <= 100
  ) {
    return parsedTemplatePageSize;
  }

  return defaultPageSize; // Default page size
}
