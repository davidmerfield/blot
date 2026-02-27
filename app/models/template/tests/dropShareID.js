describe("template", function () {
  require("./setup")({ createTemplate: true, createView: true });

  var createShareID = require("../index").createShareID;
  var dropShareID = require("../index").dropShareID;
  var client = require("models/client-new");

  it("dropShareID works", function (done) {
    var test = this;
    createShareID(test.template.id, function (err, shareID) {
      if (err) return done.fail(err);
      expect(typeof shareID).toEqual("string");
      dropShareID(shareID, function (dropErr) {
        if (dropErr) return done.fail(dropErr);

        client
          .keys("*" + shareID + "*")
          .then(function (result) {
            expect(result).toEqual([]);
            done();
          })
          .catch(done.fail);
      });
    });
  });
});
