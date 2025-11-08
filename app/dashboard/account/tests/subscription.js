const { promisify } = require("util");
const config = require("config");
const Blog = require("models/blog");
const User = require("models/user");
const Subscription = require("dashboard/account/subscription");

const setUser = promisify(User.set);
const getUser = promisify(User.getById);
const getBlog = promisify(Blog.get);

describe("Dashboard subscription pause and resume", function () {
  global.test.blog();

  beforeEach(function () {
    this.originalFetch = global.fetch;
  });

  afterEach(function () {
    Subscription._resetStripeClient();
    global.fetch = this.originalFetch;
  });

  it("pauses and resumes Stripe subscriptions", async function () {
    const subscriptionId = `sub_test_${Date.now()}`;
    const customerId = `cus_test_${Date.now()}`;

    await setUser(this.user.uid, {
      subscription: {
        id: subscriptionId,
        customer: customerId,
        status: "active",
        plan: { amount: 500, interval: "month" },
        quantity: 1,
      },
      pause: { active: false },
    });

    const stripeResponses = [
      {
        status: "active",
        pause_collection: { behavior: "mark_uncollectible" },
        plan: { amount: 500, interval: "month" },
        quantity: 1,
      },
      {
        status: "active",
        pause_collection: null,
        plan: { amount: 500, interval: "month" },
        quantity: 1,
      },
    ];

    const stripeClient = {
      subscriptions: {
        update: jasmine
          .createSpy("update")
          .and.callFake(async (id, params) => {
            expect(id).toBe(subscriptionId);
            expect(params).toBeDefined();
            const next = stripeResponses.shift();
            if (!next) throw new Error("No mocked response available");

            if (next.pause_collection) {
              expect(params.pause_collection).toEqual(
                jasmine.objectContaining({ behavior: "mark_uncollectible" })
              );
            } else {
              expect(params).toEqual(jasmine.objectContaining({ pause_collection: null }));
            }

            return Object.assign({ id, customer: customerId }, next);
          }),
      },
    };

    Subscription._setStripeClient(stripeClient);

    const activeUser = await getUser(this.user.uid);
    await Subscription.exports.pauseStripe(activeUser);

    const pausedUser = await getUser(this.user.uid);
    expect(pausedUser.pause).toEqual(
      jasmine.objectContaining({ active: true, provider: "stripe" })
    );
    expect(pausedUser.isDisabled).toBe(true);

    const pausedBlog = await getBlog({ id: this.blog.id });
    expect(pausedBlog.isDisabled).toBe(true);

    await Subscription.exports.resumeStripe(await getUser(this.user.uid));

    const resumedUser = await getUser(this.user.uid);
    expect(resumedUser.pause).toEqual(
      jasmine.objectContaining({ active: false, provider: "stripe" })
    );
    expect(resumedUser.isDisabled).toBe(false);

    const resumedBlog = await getBlog({ id: this.blog.id });
    expect(resumedBlog.isDisabled).toBe(false);

    expect(stripeClient.subscriptions.update.calls.count()).toBe(2);
  });

  it("pauses and resumes PayPal subscriptions", async function () {
    const subscriptionId = `I-${Date.now()}`;

    await setUser(this.user.uid, {
      paypal: {
        id: subscriptionId,
        status: "ACTIVE",
        plan_id: "P-123",
        quantity: "1",
        billing_info: {},
      },
    });

    const expectedAuth = `Basic ${Buffer.from(
      `${config.paypal.client_id}:${config.paypal.secret}`
    ).toString("base64")}`;

    const fetchQueue = [
      { status: 204 },
      { status: 200, body: { id: subscriptionId, status: "SUSPENDED" } },
      { status: 204 },
      { status: 200, body: { id: subscriptionId, status: "ACTIVE" } },
    ];

    global.fetch = jasmine
      .createSpy("fetch")
      .and.callFake(async (url, options = {}) => {
        if (!fetchQueue.length) throw new Error("No mocked PayPal responses left");
        const next = fetchQueue.shift();

        if (url.endsWith("/suspend")) {
          expect(options.method).toBe("POST");
          expect(options.headers.Authorization).toBe(expectedAuth);
          expect(options.body).toBe(
            JSON.stringify({ reason: "Customer requested pause" })
          );
        } else if (url.endsWith("/activate")) {
          expect(options.method).toBe("POST");
          expect(options.headers.Authorization).toBe(expectedAuth);
          expect(options.body).toBe(
            JSON.stringify({ reason: "Customer requested resume" })
          );
        } else {
          expect(url).toContain(`/v1/billing/subscriptions/${subscriptionId}`);
          expect(options.headers.Authorization).toBe(expectedAuth);
        }

        const body = next.body;

        return {
          ok: next.status >= 200 && next.status < 300,
          status: next.status,
          json: async () => body || {},
          text: async () => (body ? JSON.stringify(body) : ""),
        };
      });

    await Subscription.exports.pausePaypal(await getUser(this.user.uid));

    const pausedUser = await getUser(this.user.uid);
    expect(pausedUser.pause).toEqual(
      jasmine.objectContaining({ active: true, provider: "paypal" })
    );
    expect(pausedUser.isDisabled).toBe(true);

    const pausedBlog = await getBlog({ id: this.blog.id });
    expect(pausedBlog.isDisabled).toBe(true);

    await Subscription.exports.resumePaypal(await getUser(this.user.uid));

    const resumedUser = await getUser(this.user.uid);
    expect(resumedUser.pause).toEqual(
      jasmine.objectContaining({ active: false, provider: "paypal" })
    );
    expect(resumedUser.isDisabled).toBe(false);

    const resumedBlog = await getBlog({ id: this.blog.id });
    expect(resumedBlog.isDisabled).toBe(false);

    expect(global.fetch.calls.count()).toBe(4);
  });
});
