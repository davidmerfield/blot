describe("template", function () {
  require("./setup")({ createTemplate: true });

  var update = require("../index").update;
  var getMetadata = require("../index").getMetadata;

  it("updates a template", function (done) {
    var test = this;
    var updates = { description: "Updated template description" };
    update(test.blog.id, test.template.name, updates, function (err) {
      if (err) return done.fail(err);
      getMetadata(test.template.id, function (err, template) {
        if (err) return done.fail(err);
        expect(template.description).toEqual(updates.description);
        done();
      });
    });
  });

  // Enable this once we have decided whether or not setMetadata
  // should be used for new templates. This might break uses of the
  // api internally so be carefull.
  xit("throws an error if you update a template which does not exist", function (done) {
    update(this.blog.owner, "nonexistent-template", {}, function (err) {
      expect(err instanceof Error).toEqual(true);
      done();
    });
  });
});
