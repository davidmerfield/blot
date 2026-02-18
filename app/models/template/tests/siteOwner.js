describe("template - siteOwner", function () {
  var siteOwner = require("models/template/index").siteOwner;

  it("exposes a siteOwner property which returns the owner ID of Blot", function () {
    expect(siteOwner).toEqual("SITE");
  });
});
