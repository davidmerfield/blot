describe("template - makeID", function () {
  require("./setup")();
  var makeID = require("../index").makeID;

  it("exposes a makeID method which generates a template ID", function () {
    var test = this;
    console.log(test);
    expect(makeID(test.blog.id, "example")).toEqual(test.blog.id + ":example");
  });
});
