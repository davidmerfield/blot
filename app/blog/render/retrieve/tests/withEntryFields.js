var withEntryFields = require("../helpers/withEntryFields");

describe("retrieve/withEntryFields", function () {
  it("returns the narrow result unchanged when no entry has Mustache", function (done) {
    var fullCalled = false;

    withEntryFields(
      function (cb) {
        cb([{ title: "Plain" }, { title: "Also plain" }]);
      },
      function (cb) {
        fullCalled = true;
        cb("full");
      },
      function (result) {
        expect(fullCalled).toBe(false);
        expect(result.length).toBe(2);
        done();
      }
    );
  });

  it("refetches in full when a narrowed entry carries Mustache", function (done) {
    withEntryFields(
      function (cb) {
        cb([
          { title: "Plain" },
          { title: "{{#allEntries}}{{summary}}{{/allEntries}}" },
        ]);
      },
      function (cb) {
        cb("full entries");
      },
      function (result) {
        expect(result).toEqual("full entries");
        done();
      }
    );
  });

  it("handles a single entry (not an array) from the narrow fetch", function (done) {
    withEntryFields(
      function (cb) {
        cb({ title: "{{foo}}" });
      },
      function (cb) {
        cb("full");
      },
      function (result) {
        expect(result).toEqual("full");
        done();
      }
    );
  });
});
