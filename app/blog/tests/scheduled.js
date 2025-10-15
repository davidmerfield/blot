describe("scheduled entries", function () {
  require("./util/setup")();

  let now;

  beforeEach(function () {
    now = new Date("2020-01-01T00:00:00Z");
    jasmine.clock().install();
    jasmine.clock().mockDate(now);
  });

  afterEach(function () {
    jasmine.clock().uninstall();
  });

  it("promotes a scheduled entry once its publication time arrives", async function () {
    const publishDelay = 60 * 1000; // 1 minute
    const buffer = 1000; // 1 second
    const futureDate = new Date(now.getTime() + publishDelay);

    console.log("Writing scheduled.txt with date", futureDate);

    await this.write({
      path: "/scheduled.txt",
      content:
        "Link: scheduled\nDate: " +
        futureDate.toISOString() +
        "\n\nHello, future!",
    });

    console.log("Checking /scheduled before publish time");

    console.log("Advancing clock by", publishDelay + buffer, "ms");
    jasmine.clock().tick(publishDelay + buffer);

    // Force queued microtasks to run
    await new Promise((resolve) => setImmediate(resolve));

    console.log("Immediate resolved, checking /scheduled again");
    const postPublishRes = await this.get("/scheduled");
    const body = await postPublishRes.text();

    expect(postPublishRes.status).toEqual(200);
    expect(body).toContain("Hello, future!");
  });
});
