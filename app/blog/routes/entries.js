// Older/custom templates bind {{#entries}} directly; official templates
// bind {{#posts}}. Both need the same page of entries, so route through the
// posts retriever - its per-request/process LRU cache means a view that
// also binds {{#posts}} reuses this fetch instead of calling
// Entries.getPage a second time. This does mean a plain {{#entries}} view
// now inherits posts()'s ?tag=/:tag filtering, which the old raw getPage
// call here ignored - accepted as part of standardizing on posts() as the
// single fetch path. See https://github.com/davidmerfield/blot/issues/1844
const retrievePosts = require("../render/retrieve/posts");

module.exports = async function entries(req, res, next) {
  try {
    req.log("Loading entries");
    // retrievePosts sets res.locals.pagination as a side effect.
    const entries = await retrievePosts(req, res);
    req.log("Loaded entries");

    res.locals.entries = entries;

    res.renderView("entries.html", next);
  } catch (err) {
    req.log("Error loading entries");
    return next(err);
  }
};
