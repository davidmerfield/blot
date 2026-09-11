// Back-compat: robots.js historically also registered /verify/* routes.
const registerRobots = require("./routes/robots");
const registerVerify = require("./routes/verify");

module.exports = function registerRobotsAndVerify(server) {
  registerRobots(server);
  registerVerify(server);
};
