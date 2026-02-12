const lifecycle = require("models/user/subscriptionLifecycle");

describe("user subscription lifecycle", function () {
  it("disables stripe users only after period end when cancel_at_period_end", function () {
    const now = Date.now();

    expect(
      lifecycle.shouldDisableFromStripeSubscription(
        {
          status: "active",
          cancel_at_period_end: true,
          current_period_end: Math.floor((now + 10_000) / 1000),
        },
        now
      )
    ).toBe(false);

    expect(
      lifecycle.shouldDisableFromStripeSubscription(
        {
          status: "active",
          cancel_at_period_end: true,
          current_period_end: Math.floor((now - 10_000) / 1000),
        },
        now
      )
    ).toBe(true);
  });

  it("marks deletion due one month after period end", function () {
    const now = Date.now();
    const ended = now - lifecycle.ONE_MONTH_MS - 1;

    expect(
      lifecycle.deletionDue(
        {
          subscription: {
            status: "canceled",
            current_period_end: Math.floor(ended / 1000),
          },
        },
        now
      )
    ).toBe(true);
  });

  it("does not disable paypal CANCELLED users before computed period end", function () {
    const now = Date.now();

    expect(
      lifecycle.shouldDisableFromPaypalSubscription(
        {
          status: "CANCELLED",
          plan_id: "P-1",
          billing_info: {
            last_payment: {
              time: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
            },
          },
        },
        now
      )
    ).toBe(false);
  });
});
