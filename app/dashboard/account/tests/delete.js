const Delete = require("dashboard/account/delete");
const Email = require("helper/email");
const config = require("config");
const prettyPrice = require("helper/prettyPrice");

function runMiddleware(middleware, req) {
  return new Promise((resolve, reject) => {
    middleware(req, {}, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

describe("Dashboard account deletion refunds", function () {
  const paypalDefaults = {
    client_id: config.paypal.client_id,
    secret: config.paypal.secret,
    api_base: config.paypal.api_base,
  };

  beforeEach(function () {
    this.originalFetch = global.fetch;
    Delete._resetStripeClient();

    config.paypal.client_id = "client";
    config.paypal.secret = "secret";
    config.paypal.api_base = "https://api.sandbox.paypal.com";
  });

  afterEach(function () {
    Delete._resetStripeClient();
    global.fetch = this.originalFetch;

    config.paypal.client_id = paypalDefaults.client_id;
    config.paypal.secret = paypalDefaults.secret;
    config.paypal.api_base = paypalDefaults.api_base;
  });

  it("issues a Stripe refund within the first 30 days", async function () {
    const now = Date.now();
    const created = Math.floor((now - 10 * 24 * 60 * 60 * 1000) / 1000);

    const stripeClient = {
      invoices: {
        list: jasmine
          .createSpy("list")
          .and.returnValue(
            Promise.resolve({
              data: [
                {
                  id: "in_123",
                  paid: true,
                  charge: "ch_123",
                  created,
                },
              ],
            })
          ),
      },
      refunds: {
        create: jasmine
          .createSpy("create")
          .and.returnValue(
            Promise.resolve({ id: "re_123", amount: 1200, currency: "usd" })
          ),
      },
      customers: {
        del: jasmine.createSpy("del"),
      },
    };

    Delete._setStripeClient(stripeClient);

    const req = {
      user: {
        subscription: { customer: "cus_123", created },
        email: "user@example.com",
      },
    };

    await runMiddleware(Delete.exports.refund, req);

    expect(stripeClient.invoices.list).toHaveBeenCalledWith({
      customer: "cus_123",
      limit: 100,
    });
    expect(stripeClient.refunds.create).toHaveBeenCalledWith({
      charge: "ch_123",
      reason: "requested_by_customer",
    });
    expect(req.refund).toEqual(
      jasmine.objectContaining({
        issued: true,
        provider: "stripe",
        providerPretty: "Stripe",
        amount: 1200,
        currency: "USD",
        amountPretty: prettyPrice(1200),
      })
    );
  });

  it("skips Stripe refunds outside the first month", async function () {
    const created = Math.floor((Date.now() - 40 * 24 * 60 * 60 * 1000) / 1000);

    const stripeClient = {
      invoices: {
        list: jasmine.createSpy("list"),
      },
      refunds: {
        create: jasmine.createSpy("create"),
      },
      customers: {
        del: jasmine.createSpy("del"),
      },
    };

    Delete._setStripeClient(stripeClient);

    const req = {
      user: {
        subscription: { customer: "cus_old", created },
        email: "user@example.com",
      },
    };

    await runMiddleware(Delete.exports.refund, req);

    expect(stripeClient.invoices.list).not.toHaveBeenCalled();
    expect(stripeClient.refunds.create).not.toHaveBeenCalled();
    expect(req.refund).toBeUndefined();
  });

  it("issues a PayPal refund within the first 30 days", async function () {
    const startTime = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const expectedAuth = `Basic ${Buffer.from("client:secret").toString("base64")}`;

    const transactionsData = {
      transactions: [
        {
          id: "CAPTURE123",
          status: "COMPLETED",
          time: new Date().toISOString(),
          amount_with_breakdown: {
            gross_amount: { value: "12.00", currency_code: "USD" },
          },
        },
      ],
    };

    const refundData = {
      id: "REFUND123",
      amount: { value: "12.00", currency_code: "USD" },
    };

    const fetchSpy = jasmine.createSpy("fetch").and.callFake((url, options = {}) => {
      if (url.includes("/transactions")) {
        expect(options.headers.Authorization).toBe(expectedAuth);
        return Promise.resolve(mockResponse(200, transactionsData));
      }

      if (url.includes("/refund")) {
        expect(options.method).toBe("POST");
        expect(options.headers.Authorization).toBe(expectedAuth);
        return Promise.resolve(mockResponse(201, refundData));
      }

      return Promise.reject(new Error(`Unexpected URL ${url}`));
    });

    global.fetch = fetchSpy;

    const req = {
      user: {
        paypal: { id: "I-123", status: "ACTIVE", start_time: startTime },
        email: "user@example.com",
      },
    };

    await runMiddleware(Delete.exports.refund, req);

    expect(fetchSpy.calls.count()).toBe(2);
    expect(req.refund).toEqual(
      jasmine.objectContaining({
        issued: true,
        provider: "paypal",
        providerPretty: "PayPal",
        amount: 1200,
        currency: "USD",
        amountPretty: prettyPrice(1200),
      })
    );
  });

  it("skips PayPal refunds outside the first month", async function () {
    const startTime = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

    const fetchSpy = jasmine.createSpy("fetch");
    global.fetch = fetchSpy;

    const req = {
      user: {
        paypal: { id: "I-999", status: "ACTIVE", start_time: startTime },
        email: "user@example.com",
      },
    };

    await runMiddleware(Delete.exports.refund, req);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(req.refund).toBeUndefined();
  });

  it("sends the refund email when a refund is issued", function (done) {
    const refund = {
      issued: true,
      provider: "stripe",
      providerPretty: "Stripe",
      amountPretty: prettyPrice(500),
      currency: "USD",
    };

    spyOn(Email, "ACCOUNT_DELETION_REFUND").and.callFake((uid, locals, callback) =>
      callback()
    );
    spyOn(Email, "DELETED").and.callFake((uid, locals, callback) => callback());

    const req = {
      user: { uid: "user_123", email: "user@example.com" },
      refund,
    };

    Delete.exports.email(req, {}, function (err) {
      expect(err).toBeUndefined();
      expect(Email.ACCOUNT_DELETION_REFUND).toHaveBeenCalledWith(
        "",
        jasmine.objectContaining({ refund, email: "user@example.com" }),
        jasmine.any(Function)
      );
      expect(Email.DELETED).not.toHaveBeenCalled();
      done();
    });
  });
});

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}
