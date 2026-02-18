describe("template - createShareID", function () {
  require("./setup")({ createTemplate: true, createView: true });

  var createShareID = require("../index").createShareID;
  var getByShareID = require("../index").getByShareID;

  it("createShareID works", function (done) {
    var test = this;
    createShareID(test.template.id, function (err, shareID) {
      if (err) return done.fail(err);
      expect(typeof shareID).toEqual("string");
      getByShareID(shareID, function (err, template) {
        if (err) return done.fail(err);
        expect(template.id).toEqual(test.template.id);
        expect(template.shareID).toEqual(shareID);
        done();
      });
    });
  });
});
