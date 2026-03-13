describe("user", function () {
  global.test.user();

  var set = require("../index").set;
  var client = require("models/client");
  var key = require("../key");

  it("set will remove key for old email when email changes", function (done) {
    var test = this;
    client.get(key.email(test.user.email), function (err, uid) {
      if (err) return done.fail(err);
      expect(uid).toEqual(test.user.uid);
      set(uid, { email: "foo@gmail.com" }, function (err) {
        if (err) return done.fail(err);
        client.get(key.email(test.user.email), function (err, uid) {
          if (err) return done.fail(err);
          expect(uid).toEqual(null);
          done();
        });
      });
    });
  });
});
