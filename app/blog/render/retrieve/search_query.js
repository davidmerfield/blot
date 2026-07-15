module.exports = function (req, res, callback) {
  return callback(null, req.query.q);
};
