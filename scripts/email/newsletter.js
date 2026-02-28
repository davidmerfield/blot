var send = require("helper/email").send;
var letter = process.argv[2];
var fs = require("fs");
var createRedisClient = require("../util/createRedisClient");
var async = require("async");

if (!letter) {
  console.log("Select an email to send:");
  fs.readdirSync(__dirname + "/../../app/helper/email/newsletters").forEach(
    function (letter) {
      console.log("node scripts/email/newsletter", letter);
    }
  );
  process.exit();
}

(async function () {
  var redis = await createRedisClient();
  main(redis.client, letter, async function (err) {
    if (err) {
      console.error(err);
      await redis.close();
      process.exit(1);
    }

    console.log("All emails delivered!");
    await redis.close();
    process.exit();
  });
})();

function main(client, letter, callback) {
  var emailPath = __dirname + "/../../app/helper/email/newsletters/" + letter;

  if (!fs.statSync(emailPath).isFile())
    return callback(new Error("Not a file"));

  getAllSubscribers(client, function (err, emails) {
    if (err) return callback(err);

    console.log(
      "Sending " + letter + " out to " + emails.length + " subscribers"
    );

    async.filter(emails, function (email, done) {
      alreadySent(client, email, done);
    }, function (err, emails) {
      if (err) return callback(err);

      // When we want to preview a newsletter before it goes out
      if (process.env.PREVIEW_NEWSLETTER === 'true') {
        emails = ['example@example.com'];
      }

      async.eachSeries(
        emails,
        function (email, next) {
          console.log("Sending", email);

          send({ email: email }, emailPath, email, function (err) {
            if (err) return next(err);

            console.log(". Email sent to", email);
            client.sadd("newsletter:letter:" + letter, email, next);
          });
        },
        callback
      );
    });
  });
}

function getAllSubscribers(client, callback) {
  client.smembers("newsletter:list", callback);
}

function alreadySent(client, email, done) {
  client.sismember("newsletter:letter:" + letter, email, function (
    err,
    member
  ) {
    if (member === 1) console.log("Email already sent to", email);
    done(err, member === 0);
  });
}
