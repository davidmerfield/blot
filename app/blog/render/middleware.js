const { sendView } = require("./pipeline");

module.exports = function attachRenderView(req, res, next) {
  res.renderView = function (name, routeNext) {
    return sendView(req, res, name, routeNext);
  };
  next();
};
