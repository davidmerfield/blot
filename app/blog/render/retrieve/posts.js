const Entry = require("models/entry");
const { getPage } = require("models/entries");
const fetchTaggedEntries = require("./helpers/fetchTaggedEntries");

module.exports = function (req, res, callback) {
  const blogID = req?.blog?.id;
  const log = typeof req?.log === "function" ? req.log.bind(req) : () => {};

  const options = {
    sortBy: req?.template?.locals?.sort_by,
    order: req?.template?.locals?.sort_order,
    pageNumber: req?.params?.page ?? req?.query?.page,
    pageSize: res.locals?.page_size ?? req?.template?.locals?.page_size,
    pathPrefix: res.locals?.path_prefix ?? req?.template?.locals?.path_prefix,
  };

  const tags = req?.query?.tag || req?.params?.tag || res?.locals?.tag;

  if (!tags) {
    log("Loading page of entries");
    return getPage(blogID, options, (err, entries, pagination) => {
      if (err) {
        return callback(err);
      }

      res.locals.pagination = pagination;

      callback(null, entries);
    });
  }

  let page = parseInt(options.pageNumber, 10);
  if (!page || page < 1) page = 1;

  let limit = parseInt(options.pageSize, 10);
  if (!Number.isFinite(limit)) limit = undefined;
  if (!limit || limit < 1 || limit > 500) limit = 100;

  const offset = (page - 1) * limit;

  log("Loading tagged page of entries");
  fetchTaggedEntries(
    blogID,
    tags,
    { limit, offset, pathPrefix: options.pathPrefix },
    (err, result) => {
      if (err) {
        return callback(err);
      }

      Entry.get(blogID, result.entryIDs || [], (entries) => {
        entries.sort((a, b) => b.dateStamp - a.dateStamp);
        res.locals.pagination = result.pagination || {};
        callback(null, entries);
      });
    }
  );
};
