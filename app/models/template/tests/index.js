describe("template - index", function () {
  require("./setup")();

  it("loads the API without error", function () {
    expect(function () {
      require("../index");
    }).not.toThrow();
  });
});
