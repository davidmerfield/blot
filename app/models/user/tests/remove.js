var client = require("models/client");
var key = require("../key");
var User = require("../index");
var promisify = require("util").promisify;
var remove = promisify(User.remove);
var getById = promisify(User.getById);
var create = promisify(User.create);
var hashPassword = promisify(User.hashPassword);

describe("user remove", function () {
  var uid = "user_remove_test";
  var email = "remove@example.com";
  var customerId = "cus_remove_test";
  var paypalId = "I-REMOVE_TEST";

  async function createTestUser(options) {
    options = options || {};
    var userEmail = options.email || email;
    var passwordHash = await hashPassword("password");
    var subscription = options.subscription || {};
    var paypal = options.paypal || {};
    return create(userEmail, passwordHash, subscription, paypal);
  }

  afterEach(async function () {
    await client.del([
      key.user(uid),
      key.email(email),
      key.customer(customerId),
      key.paypal(paypalId),
      "sync:lease:" + uid,
      "sync:again:" + uid
    ]);
    await client.sRem(key.uids, uid);
  });

  it("removes user from Redis", async function () {
    var user = await createTestUser();
    await remove(user.uid);
    var result = await getById(user.uid);
    expect(result).toBeNull();
  });

  it("removes user from uids set", async function () {
    var user = await createTestUser();
    var beforeMembers = await client.sMembers(key.uids);
    expect(beforeMembers).toContain(user.uid);
    
    await remove(user.uid);
    
    var afterMembers = await client.sMembers(key.uids);
    expect(afterMembers).not.toContain(user.uid);
  });

  it("removes email index", async function () {
    var user = await createTestUser();
    var beforeEmail = await client.get(key.email(user.email));
    expect(beforeEmail).toEqual(user.uid);
    
    await remove(user.uid);
    
    var afterEmail = await client.get(key.email(user.email));
    expect(afterEmail).toBeNull();
  });

  it("removes Stripe customer index", async function () {
    var user = await createTestUser({ subscription: { customer: customerId } });
    var beforeCustomer = await client.get(key.customer(customerId));
    expect(beforeCustomer).toEqual(user.uid);
    
    await remove(user.uid);
    
    var afterCustomer = await client.get(key.customer(customerId));
    expect(afterCustomer).toBeNull();
  });

  it("removes PayPal subscription index", async function () {
    var user = await createTestUser({ paypal: { id: paypalId } });
    var beforePaypal = await client.get(key.paypal(paypalId));
    expect(beforePaypal).toEqual(user.uid);
    
    await remove(user.uid);
    
    var afterPaypal = await client.get(key.paypal(paypalId));
    expect(afterPaypal).toBeNull();
  });

  it("removes sync lease keys", async function () {
    var user = await createTestUser();
    await client.set("sync:lease:" + user.uid, "value");
    await client.set("sync:again:" + user.uid, "value");
    
    await remove(user.uid);
    
    var leaseAfter = await client.get("sync:lease:" + user.uid);
    var againAfter = await client.get("sync:again:" + user.uid);
    expect(leaseAfter).toBeNull();
    expect(againAfter).toBeNull();
  });

  it("returns error for non-existent user", async function () {
    var error = await remove("user_nonexistent").then(
      function () { return null; },
      function (err) { return err; }
    );
    expect(error).not.toBeNull();
    expect(error.message).toEqual("No user");
  });

  it("handles user with both Stripe and PayPal subscriptions", async function () {
    var user = await createTestUser({
      subscription: { customer: customerId },
      paypal: { id: paypalId }
    });
    
    await remove(user.uid);
    
    expect(await client.get(key.customer(customerId))).toBeNull();
    expect(await client.get(key.paypal(paypalId))).toBeNull();
    expect(await getById(user.uid)).toBeNull();
  });

  it("handles user with no subscriptions", async function () {
    var user = await createTestUser({ subscription: {}, paypal: {} });
    
    await remove(user.uid);
    
    expect(await getById(user.uid)).toBeNull();
  });
});
