describe("template - getAllViews", function () {
  require("./setup")({ createTemplate: true, createView: true });

  var getAllViews = require("../index").getAllViews;

  it("gets alls views", function (done) {
    var test = this;
    getAllViews(test.template.id, function (err, views) {
      if (err) return done.fail(err);
      expect(views).toEqual(jasmine.any(Object));
      expect(views[test.view.name].content).toEqual(test.view.content);
      done();
    });
  });

  xit("returns an error for a non-existent view", function (done) {
    var test = this;
    getAllViews(test.template.id, "", function (err, savedView) {
      expect(err instanceof Error).toBe(true);
      expect(savedView).toBeFalsy();
      done();
    });
  });

  xit("returns an error for a non-existent template", function (done) {
    var test = this;
    getAllViews("", test.view.name, function (err, savedView) {
      expect(err instanceof Error).toBe(true);
      expect(savedView).toBeFalsy();
      done();
    });
  });
});
