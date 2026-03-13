describe("template", function () {
  require("./setup")({ createTemplate: true, createView: true });

  var createShareID = require("../index").createShareID;
  var dropShareID = require("../index").dropShareID;
  var client = require("models/client");

  it("dropShareID works", function (done) {
    var test = this;
    createShareID(test.template.id, function (err, shareID) {
      if (err) return done.fail(err);
      expect(typeof shareID).toEqual("string");
      dropShareID(shareID, function (err) {
        if (err) return done.fail(err);
        client.keys("*" + shareID + "*", function (err, result) {
          if (err) return done.fail(err);
          expect(result).toEqual([]);
          done();
        });
      });
    });
  });
});
