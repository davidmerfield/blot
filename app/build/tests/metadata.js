describe("metadata parser", function () {
  var Metadata = require("../metadata");

  function expectMetadata(metadata, expected) {
    var expectedKeys = Object.keys(expected);

    expect(Object.keys(metadata)).toEqual(expectedKeys);

    expectedKeys.forEach(function (key) {
      expect(metadata[key]).toEqual(expected[key]);

      var aliasKey = key.toLowerCase();

      if (aliasKey !== key) {
        expect(
          Object.prototype.hasOwnProperty.call(metadata, aliasKey)
        ).toEqual(false);
      }
    });

    expect(JSON.parse(JSON.stringify(metadata))).toEqual(expected);
  }

  it("parses metadata", function () {
    var metadata = Metadata(
      ["Page:yes", "Permalink:", "Date: 12/10/12", "", "# Hi"].join("\n")
    ).metadata;

    expectMetadata(metadata, {
      Page: "yes",
      Permalink: "",
      Date: "12/10/12"
    });
  });

  it("parses metadata with Windows newlines", function () {
    var metadata = Metadata(
      ["Page:yes", "Permalink:", "Date: 12/10/12", "", "# Hi"].join("\r\n")
    ).metadata;

    expectMetadata(metadata, {
      Page: "yes",
      Permalink: "",
      Date: "12/10/12"
    });
  });

  it("parses metadata with non-standard return character newlines", function () {
    var metadata = Metadata(
      ["Page:yes", "Permalink:", "Date: 12/10/12", "", "# Hi"].join("\r")
    ).metadata;

    expectMetadata(metadata, {
      Page: "yes",
      Permalink: "",
      Date: "12/10/12"
    });
  });

  it("parses YAML metadata", function () {
    var metadata = Metadata(
      ["---", "Page: yes", "Permalink: hey", "---", "", "# Hi"].join("\n")
    ).metadata;

    expectMetadata(metadata, {
      Page: "yes",
      Permalink: "hey"
    });
  });

  it("parses empty YAML metadata", function () {
    var metadata = Metadata(["---", "Summary: ", "---", "", "# Hi"].join("\n"))
      .metadata;

    expectMetadata(metadata, {
      Summary: ""
    });
  });

  it("parses arrays in YAML metadata", function () {
    var metadata = Metadata(
      ["---", "Tags:", "  - one", "  - two", "---", "", "# Hi"].join("\n")
    ).metadata;

    expectMetadata(metadata, {
      Tags: ["one", "two"]
    });
  });

  it("parses empty metadata", function () {
    var metadata = Metadata(["Summary: ", "", "# Hi"].join("\n")).metadata;

    expectMetadata(metadata, {
      Summary: ""
    });
  });

  it("handles colons", function () {
    var metadata = Metadata(
      ["Author:me", "", "What about a colon in the next line: yes you."].join(
        "\n"
      )
    ).metadata;

    expectMetadata(metadata, {
      Author: "me"
    });
  });

  it("stops parsing when a line lacks a colon", function () {
    var metadata = Metadata(["Author:me", "Hey", "Date: 1"].join("\n")).metadata;

    expectMetadata(metadata, {
      Author: "me"
    });
  });

  it("handles spaces in the metadata key", function () {
    var metadata = Metadata(["Author name: Jason"].join("\n")).metadata;

    expectMetadata(metadata, {
      "Author name": "Jason"
    });
  });

  it("allows a maximum of one space in the metadata key", function () {
    var metadata = Metadata(["And he called: Jason"].join("\n")).metadata;

    expectMetadata(metadata, {});
  });

  it("allows dashes in the metadata key", function () {
    var metadata = Metadata(["Is-Social: Yes"].join("\n")).metadata;

    expectMetadata(metadata, {
      "Is-Social": "Yes"
    });
  });

  it("allows underscores in the metadata key", function () {
    var metadata = Metadata(["Is_Social: Yes"].join("\n")).metadata;

    expectMetadata(metadata, {
      Is_Social: "Yes"
    });
  });

  it("disallows punctuation in the metadata key", function () {
    var metadata = Metadata(["Lo! Said: Jason"].join("\n")).metadata;

    expectMetadata(metadata, {});
  });

  it("handles pure metadata", function () {
    var metadata = Metadata(["only:metadata", "in:this"].join("\n")).metadata;

    expectMetadata(metadata, {
      only: "metadata",
      in: "this"
    });
  });

  it("ignores a title with a colon", function () {
    var metadata = Metadata(
      [
        "# Since the title: is on the first line, no metada should be extracted",
        "Date: 1"
      ].join("\n")
    ).metadata;

    expectMetadata(metadata, {});
  });

  it("does not interpret a URL as a metadata key", function () {
    var metadata = Metadata(["<a href='/'>http://example.com</a>"].join("\n"))
      .metadata;

    expectMetadata(metadata, {});
  });

  it("parses a URL as a metadata value", function () {
    var metadata = Metadata(["Thumbnail: http://example.com/image.jpg"].join("\n"))
      .metadata;

    expectMetadata(metadata, {
      Thumbnail: "http://example.com/image.jpg"
    });
  });

  it("preserves nested metadata casing", function () {
    var metadata = Metadata(
      ["---", "Seo:", "  Title: Hello", "---", "", "# Hi"].join("\n")
    ).metadata;

    expectMetadata(metadata, {
      Seo: {
        Title: "Hello"
      }
    });

    var nested = metadata.Seo;

    expect(Object.keys(nested)).toEqual(["Title"]);
    expect(nested.Title).toEqual("Hello");
    expect(Object.prototype.hasOwnProperty.call(nested, "title")).toEqual(
      false
    );
  });
});
