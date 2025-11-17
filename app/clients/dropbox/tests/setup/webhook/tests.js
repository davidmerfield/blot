describe("webhook", function () {
  var Webhook = require("./index");
  var server = require("../server");

  // Set up a clean server for each test
  beforeEach(server.start);
  afterEach(server.close);

  xit("challenges", function (done) {
    var webhook = new Webhook(
      process.env.BLOT_DROPBOX_APP_SECRET,
      "http://localhost:" + this.server.port + "/clients/dropbox/webhook"
    );

    webhook.challenge("xyz", function (err) {
      if (err) done.fail(err);

      done();
    });
  });

  xit("notifies", function (done) {
    var webhook = new Webhook(
      process.env.BLOT_DROPBOX_APP_SECRET,
      "http://localhost:" + this.server.port + "/clients/dropbox/webhook"
    );

    webhook.notify(process.env.BLOT_DROPBOX_TEST_ACCOUNT_ID, function (err) {
      if (err) done.fail(err);

      done();
    });
  });
});
