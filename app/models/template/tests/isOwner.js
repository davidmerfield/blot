describe("template", function () {
  require("./setup")({ createTemplate: true });

  var isOwner = require("../index").isOwner;

  it("exposes an isOwner method which checks who owns a template", function (done) {
    isOwner(this.blog.id, this.template.id, function (err, res) {
      if (err) return done.fail(err);
      expect(res).toBeTruthy();
      done();
    });
  });

  it("exposes an isOwner method which checks who owns a template", function (done) {
    isOwner(this.blog.id, "nonexistent:template", function (err, res) {
      if (err) return done.fail(err);
      expect(res).toBeFalsy();
      done();
    });
  });
});
