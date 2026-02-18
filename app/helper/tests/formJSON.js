describe("formJSON  - formJSON", function () {
  var formJSON = require("../formJSON");

  it("works", function () {
    var field1 = {
      "foo.baz": 1,
      "foo.bar": 2,
      "foo.bat.cat": 3,
      "foo.bat.bar": 4,
    };

    var model1 = {
      foo: {
        baz: "number",
        bar: "number",
        bat: {
          cat: "number",
          bar: "string",
        },
      },
    };

    var result1 = {
      foo: {
        baz: 1,
        bar: 2,
        bat: {
          cat: 3,
          bar: "4",
        },
      },
    };

    expect(formJSON(field1, model1)).toEqual(result1);
  });

  it("works again", function () {
    var field2 = {
      "foo.bar.1.title": "Hello",
      "foo.bar.1.url": "Bye",
      "foo.bar.1.id": "1",
      "foo.bar.2.title": "OK",
      "foo.bar.2.url": "GO",
      "foo.bar.2.id": "2",
    };

    var model2 = {
      foo: {
        bar: [{ id: "string", title: "string", url: "string" }],
      },
    };

    var expected2 = {
      foo: {
        bar: [
          { title: "Hello", url: "Bye", id: "1" },
          { title: "OK", url: "GO", id: "2" },
        ],
      },
    };

    expect(formJSON(field2, model2)).toEqual(expected2);
  });
});
