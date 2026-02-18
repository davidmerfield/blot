describe("template - viewModel", function () {
  var viewModel = require("../index").viewModel;

  it("exposes a viewModel property which defines the data structure of each view", function () {
    expect(viewModel).toEqual(jasmine.any(Object));
  });
});
