describe("Blot's documentation'", function () {

  global.test.site();
  global.test.timeout(5 * 60 * 1000); // Set timeout to 5 minutes

  it("has no broken links", async function () {
    await this.checkBrokenLinks();
  });
});
