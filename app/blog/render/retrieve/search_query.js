const asRetriever = require("../../lib/asRetriever");

module.exports = asRetriever(async function (req, res) {
  return req.query.q;
});
