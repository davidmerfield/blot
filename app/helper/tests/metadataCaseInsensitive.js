const metadataCaseInsensitive = require("../metadataCaseInsensitive");

describe("metadataCaseInsensitive", function () {
  it("returns lowercase-key metadata values", function () {
    const metadata = {
      Page: "yes",
      MENU: "no",
      ThUmBnAiL: "cover.jpg",
      Permalink: "/hello"
    };

    expect(metadataCaseInsensitive(metadata)).toEqual({
      page: "yes",
      menu: "no",
      thumbnail: "cover.jpg",
      permalink: "/hello"
    });
  });

  it("uses first key in deterministic order for collisions", function () {
    const metadata = {
      permalink: "/lower",
      Permalink: "/upper"
    };

    const view = metadataCaseInsensitive(metadata);

    expect(view.permalink).toEqual(metadata[Object.keys(metadata).sort((a, b) => a.localeCompare(b))[0]]);
  });
});
