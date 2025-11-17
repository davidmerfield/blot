var http = require("http");
var URL = require("url");
var crypto = require("crypto");

module.exports = function (secret, baseUrl) {
  return {
    challenge: function (syn, callback) {
      var challengeUrl;

      challengeUrl = URL.parse(baseUrl, { parseQueryString: true });
      challengeUrl.query.challenge = syn || "Hello, World!";
      challengeUrl = URL.format(challengeUrl);

      http.get(challengeUrl, function check(res) {
        var ack = "";

        if (res.statusCode !== 200)
          return callback(
            new Error("Bad status code at challenge route: " + res.statusCode)
          );

        res.setEncoding("utf8");
        res.on("data", function (chunk) {
          ack += chunk;
        });
        res.on("end", function () {
          if (ack === syn) {
            callback(null);
          } else {
            callback(new Error("Challenge was not met"));
          }
        });
      });
    },
    notify: function (accountID, callback) {
      var body = JSON.stringify({ list_folder: { accounts: [accountID] } });
      var signature = crypto.createHmac("SHA256", secret);

      signature.update(body);
      signature = signature.digest("hex");

      var notifyUrl = URL.parse(baseUrl, { parseQueryString: true });

      var options = {
        hostname: notifyUrl.hostname,
        port: notifyUrl.port,
        path: notifyUrl.path,
        method: "POST",
        headers: {
          "X-Dropbox-Signature": signature,
          "Content-type": "application/json",
        },
      };

      var req = http.request(options, function (res) {
        if (res.statusCode === 200) {
          callback(null);
        } else {
          callback(new Error("bad status " + res.statusCode));
        }
      });

      req.write(body);
      req.end();
    },
  };
};
