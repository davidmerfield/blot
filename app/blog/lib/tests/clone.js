const { estimateCacheSize } = require("../clone");

describe("estimateCacheSize", function () {
  it("charges entry HTML instead of a flat per-item fee", function () {
    const small = {
      contents: [{ name: "a.txt", entry: { html: "hi" } }],
    };
    const large = {
      contents: [{ name: "a.txt", entry: { html: "x".repeat(10000) } }],
    };

    expect(estimateCacheSize(large)).toBeGreaterThan(estimateCacheSize(small));
    expect(estimateCacheSize(large)).toBeGreaterThan(256);
  });

  it("counts Date fields without treating them as empty objects", function () {
    expect(estimateCacheSize({ updated: new Date() })).toBeGreaterThan(8);
  });
});
