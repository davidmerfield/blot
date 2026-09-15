module.exports = function entries(req, res, next) {
  res.renderView("entries.html", next);
};
