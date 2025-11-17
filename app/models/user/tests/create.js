describe("user", function () {
  var User = require("models/user");

  it("creates and deletes a user", function (done) {
    var email = "XXX@gmail.com";
    var passwordHash = "123";
    var subscription = {};
    var paypal = {};

    User.create(
      email,
      passwordHash,
      subscription,
      paypal,
      function (err, user) {
        expect(err).toBe(null);
        expect(user).toEqual(jasmine.any(Object));

        User.remove(user.uid, function (err) {
          expect(err).toBe(null);
          done();
        });
      }
    );
  });
});
