module.exports = {
  // How many times should we append an integer to a template name
  // before giving up and surfacing the error to the user?
  MAX_DEDUPLICATION_ATTEMPTS: 999,

  // Limits for uploaded templates. The dashboard already caps a whole
  // multipart request at 30mb and setView caps a serialized view at 2mb.
  // These sit below both so we can return a useful JSON error rather than
  // the generic 413 page, or a failure part-way through persistence.
  // How many files a template may end up with. Counted after system noise
  // and hidden files have been set aside: a template kept in a git working
  // tree can carry hundreds of entries under .git which never become views,
  // and rejecting it for those would be wrong.
  UPLOAD_MAX_FILES: 100,

  // How many files we will look at at all, before deciding which are usable.
  // Only a guard against being asked to walk something enormous.
  UPLOAD_MAX_RAW_FILES: 1000,

  UPLOAD_MAX_TOTAL_BYTES: 10 * 1024 * 1024, // 10mb
  // A view's serialized payload also carries locals, partials and JSON
  // overhead, so keep the source itself well under setView's 2mb ceiling.
  UPLOAD_MAX_VIEW_BYTES: 1024 * 1024, // 1mb

  // How many wrapper directories will we strip from an upload? Dropping a
  // folder gives one; a zip of a folder containing a folder can give two.
  UPLOAD_MAX_WRAPPER_DEPTH: 5,

  // The name given to an uploaded template when we cannot infer a better one
  UPLOAD_FALLBACK_NAME: "Untitled template",

  // package.json is the interchange manifest, never a view
  PACKAGE: "package.json",
};
