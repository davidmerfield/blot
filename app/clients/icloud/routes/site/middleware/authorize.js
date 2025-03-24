const config = require("config");
const secret = config.icloud.secret;

module.exports = function authorize(req, res, next) {
  const authHeader = req.header("Authorization");

  if (!authHeader || authHeader !== secret) {
    return res.status(403).send("Forbidden: Invalid Authorization header");
  }

  next();
};
