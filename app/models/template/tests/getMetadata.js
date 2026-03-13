describe("template", function () {
  require("./setup")({ createTemplate: true });

  var getMetadata = require("../index").getMetadata;

  it("gets a template", function (done) {
    var test = this;
    getMetadata(test.template.id, function (err, template) {
      expect(err).toBeNull();
      expect(template).toEqual(test.template);
      done();
    });
  });
});
