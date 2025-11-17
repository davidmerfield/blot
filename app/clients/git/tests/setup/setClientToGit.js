var url = require("url");

module.exports = function setClientToGit (user, blog, port, callback) {
  var repoUrl;

  require("clients/git/create")(blog, function (err) {
    if (err) return callback(err);

    require("clients/git/database").getToken(blog.owner, function (err, token) {
      if (err) return callback(err);

      repoUrl = url.format({
        auth: user.email + ":" + token,
        protocol: "http",
        hostname: "127.0.0.1",
        port: port,
        pathname: "/clients/git/end/" + blog.handle + ".git"
      });

      callback(null, repoUrl);
    });
  });
};
