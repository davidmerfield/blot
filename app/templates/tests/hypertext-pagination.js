describe("hypertext pagination template", function () {
  const fs = require("fs");
  const path = require("path");
  const mustache = require("mustache");

  const template = fs.readFileSync(
    path.join(__dirname, "../source/hypertext/pagination.html"),
    "utf8"
  );

  function render(data) {
    return mustache.render(template, data);
  }

  it("emits a single next marker per page, not per post", function () {
    const html = render({
      posts: [
        { path: "/a", url: "/a", title: "A", active: "" },
        { path: "/b", url: "/b", title: "B", active: "" },
        { path: "/c", url: "/c", title: "C", active: "active" },
      ],
      pagination: { next: 2 },
    });

    const markers = html.match(/data-next="/g) || [];
    expect(markers.length).toEqual(1);
    expect(html).toContain('data-next="2"');
    expect((html.match(/<li /g) || []).length).toEqual(3);
  });

  it("omits the marker when there is no next page", function () {
    const html = render({
      posts: [{ path: "/a", url: "/a", title: "A", active: "" }],
      pagination: { next: null },
    });

    expect(html).not.toContain("data-next");
  });

  it("still emits the marker when the posts list is empty but a next page exists", function () {
    const html = render({
      posts: [],
      pagination: { next: 3 },
    });

    expect((html.match(/data-next="/g) || []).length).toEqual(1);
    expect(html).toContain('data-next="3"');
  });
});
