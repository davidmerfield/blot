describe("hypertext pagination rendering", function () {
  require("blog/tests/util/setup")();

  const fs = require("fs");
  const path = require("path");
  const pagination = fs.readFileSync(
    path.join(__dirname, "../source/hypertext/pagination.html"),
    "utf8"
  );

  it("renders one data-next marker for a page of posts even when the last post carries pagination", async function () {
    for (let i = 1; i <= 5; i++) {
      await this.write({
        path: `/post-${i}.txt`,
        content: `Title: Post ${i}\n\nHello ${i}`,
      });
    }

    await this.template(
      {
        "entries.html": `<ul class="sidebar">${pagination}</ul>`,
      },
      {
        locals: {
          page_size: 2,
        },
      }
    );

    const html = await this.text("/");
    const markers = html.match(/data-next="/g) || [];
    const items = html.match(/<li /g) || [];

    expect(items.length).toEqual(2);
    expect(markers.length).toEqual(1);
    expect(html).toContain('data-next="2"');
  });
});
