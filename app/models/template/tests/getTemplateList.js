describe("list", function () {
  require("./setup")({ createTemplate: true });

  var getTemplateList = require("../index").getTemplateList;

  it("lists all templates", function (done) {
    var test = this;
    getTemplateList(test.blog.id, function (err, result) {
      if (err) return done.fail(err);
      expect(result).toEqual(jasmine.any(Array));
      expect(result).toContain(test.template);
      done();
    });
  });

  it("does not return an error if the owner does not exist", function (done) {
    var test = this;
    getTemplateList("nonexistent:blog", function (err, result) {
      if (err) return done.fail(err);
      expect(result).toEqual(jasmine.any(Array));
      done();
    });
  });
});
