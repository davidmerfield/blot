describe("template - metadataModel", function () {
  var metadataModel = require("../index").metadataModel;

  it("exposes a metadataModel property which defines the data structure of each template", function () {
    expect(metadataModel).toEqual(jasmine.any(Object));
  });
});
