const { promisify } = require("util");
const Blog = require("models/blog");
const User = require("models/user");

const setUser = promisify(User.set);
const getUser = promisify(User.getById);
const getBlog = promisify(Blog.get);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Stripe subscription webhooks", function () {
  global.test.server(require("dashboard/webhooks/stripe_webhook"));
  global.test.blog();

  beforeEach(async function () {
    const uniqueSuffix = `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;
    this.customerId = `cus_${uniqueSuffix}`;
    this.subscriptionId = `sub_${uniqueSuffix}`;

    await setUser(this.user.uid, {
      subscription: {
        id: this.subscriptionId,
        customer: this.customerId,
        status: "past_due",
        plan: { amount: 500, interval: "month" },
        quantity: 1,
        cancel_at_period_end: false,
      },
    });
  });

  it("updates subscription details on update event", async function () {
    const event = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: this.subscriptionId,
          customer: this.customerId,
          status: "active",
          plan: { amount: 700, interval: "month" },
          quantity: 2,
          cancel_at_period_end: false,
        },
      },
    };

    const response = await this.fetch("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });

    expect(response.status).toBe(200);

    await delay(100);

    const user = await getUser(this.user.uid);
    expect(user.subscription.status).toBe("active");
    expect(user.subscription.quantity).toBe(2);
    expect(user.subscription.plan.amount).toBe(700);
    expect(user.isDisabled).toBe(false);

    const blog = await getBlog({ id: this.blog.id });
    expect(blog.isDisabled).toBe(false);
  });

  it("disables the account on deleted event", async function () {
    const event = {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: this.subscriptionId,
          customer: this.customerId,
          status: "canceled",
          plan: { amount: 500, interval: "month" },
          quantity: 1,
          cancel_at_period_end: false,
        },
      },
    };

    const response = await this.fetch("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });

    expect(response.status).toBe(200);

    await delay(100);

    const user = await getUser(this.user.uid);
    expect(user.subscription.status).toBe("canceled");
    expect(user.isDisabled).toBe(true);

    const blog = await getBlog({ id: this.blog.id });
    expect(blog.isDisabled).toBe(true);
  });
});
