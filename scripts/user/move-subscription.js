var from = process.argv[2];
var to = process.argv[3];

var get = require("../get/user");

var User = require("models/user");

console.log(from);
console.log(to);

get(from, function (err, oldUser) {
  if (err) throw err;

  get(to, function (err, newUser) {
    if (err) throw err;

    var customerID = oldUser.subscription.customer;

    var newSubscription = { subscription: oldUser.subscription };
    var oldSubscription = {
      subscription: newUser.subscription,
    };

    console.log("Customer ID", customerID);

    console.log("Subscription for ", to);
    console.log(newSubscription);

    console.log("Subscription for ", from);
    console.log(oldSubscription);

    User.set(newUser.uid, newSubscription, function (err) {
      if (err) throw err;

      User.disable(oldUser, oldSubscription, function (err) {
        if (err) throw err;

        process.exit();
      });
    });
  });
});
