var syncPaymentMethods = require("../syncPaymentMethods");
var User = require("../index");
var promisify = require("util").promisify;
var setUser = promisify(User.set);
var getUser = promisify(User.getById);

describe("user syncPaymentMethods", function () {
  global.test.user();

  afterEach(function () {
    syncPaymentMethods._resetStripeClient();
  });

  it("returns an empty list and does not call Stripe for a user without a Stripe customer", function (done) {
    syncPaymentMethods(this.user, function (err, paymentMethods) {
      expect(err).toBeFalsy();
      expect(paymentMethods).toEqual([]);
      done();
    });
  });

  describe("with a Stripe customer", function () {
    beforeEach(function (done) {
      var test = this;

      setUser(this.user.uid, {
        subscription: { id: "sub_123", customer: "cus_123" }
      }, function (err, changes) {
        if (err) return done.fail(err);

        getUser(test.user.uid, function (err, user) {
          if (err) return done.fail(err);
          test.user = user;
          done();
        });
      });
    });

    it("caches payment methods from Stripe, marking the default", function (done) {
      var stripeClient = {
        customers: {
          retrieve: jasmine
            .createSpy("retrieve")
            .and.callFake(function (customerId, cb) {
              cb(null, {
                id: customerId,
                invoice_settings: { default_payment_method: "pm_2" },
                default_source: null
              });
            })
        },
        paymentMethods: {
          list: jasmine
            .createSpy("list")
            .and.callFake(function (params, cb) {
              cb(null, {
                data: [
                  {
                    id: "pm_1",
                    card: {
                      brand: "visa",
                      last4: "4242",
                      exp_month: 1,
                      exp_year: 2030
                    }
                  },
                  {
                    id: "pm_2",
                    card: {
                      brand: "mastercard",
                      last4: "4444",
                      exp_month: 6,
                      exp_year: 2031
                    }
                  }
                ]
              });
            })
        }
      };

      syncPaymentMethods._setStripeClient(stripeClient);

      var test = this;

      syncPaymentMethods(this.user, function (err, paymentMethods) {
        if (err) return done.fail(err);

        expect(stripeClient.paymentMethods.list).toHaveBeenCalledWith(
          { customer: "cus_123", type: "card" },
          jasmine.any(Function)
        );

        expect(paymentMethods.length).toBe(2);
        expect(paymentMethods[0]).toEqual(
          jasmine.objectContaining({ id: "pm_1", brand: "visa", isDefault: false })
        );
        expect(paymentMethods[1]).toEqual(
          jasmine.objectContaining({ id: "pm_2", brand: "mastercard", isDefault: true })
        );

        getUser(test.user.uid, function (err, user) {
          if (err) return done.fail(err);
          expect(user.paymentMethods.length).toBe(2);
          done();
        });
      });
    });

    it("falls back to the legacy default source when there's no default PaymentMethod", function (done) {
      var stripeClient = {
        customers: {
          retrieve: jasmine
            .createSpy("retrieve")
            .and.callFake(function (customerId, cb) {
              cb(null, {
                id: customerId,
                invoice_settings: {},
                default_source: "card_legacy1"
              });
            }),
          retrieveCard: jasmine
            .createSpy("retrieveCard")
            .and.callFake(function (customerId, cardId, cb) {
              cb(null, {
                object: "card",
                id: cardId,
                brand: "Visa",
                last4: "1881",
                exp_month: 3,
                exp_year: 2029
              });
            })
        },
        paymentMethods: {
          list: jasmine
            .createSpy("list")
            .and.callFake(function (params, cb) {
              cb(null, { data: [] });
            })
        }
      };

      syncPaymentMethods._setStripeClient(stripeClient);

      syncPaymentMethods(this.user, function (err, paymentMethods) {
        if (err) return done.fail(err);

        expect(stripeClient.customers.retrieveCard).toHaveBeenCalledWith(
          "cus_123",
          "card_legacy1",
          jasmine.any(Function)
        );
        expect(paymentMethods.length).toBe(1);
        expect(paymentMethods[0]).toEqual(
          jasmine.objectContaining({
            id: "card_legacy1",
            brand: "visa",
            isDefault: true,
            isLegacy: true
          })
        );
        done();
      });
    });
  });
});
