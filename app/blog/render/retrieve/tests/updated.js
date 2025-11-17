describe("updated", function () {
  require("blog/tests/util/setup")();

  const moment = require("moment");
  require("moment-timezone");

  it("lists updated date as a string which respects the site date_display format", async function () {
    await this.write({ path: "/a.txt", content: "Tags: abc\n\nFoo" });
    await this.template(
      {
        "cacheid.html": `{{cacheID}}`,
        "entries.html": `{{updated}}`,
      },
      {
        locals: {
          date_display: "YYYY MMM DD [at] HH:mm",
        },
      }
    );

    const cacheID = parseInt(await this.text("/cacheid.html"));
    const d = moment.utc(cacheID).tz(this.blog.timeZone);

    const body = await this.text("/");

    expect(body.trim()).toEqual(`${d.format("YYYY MMM DD [at] HH:mm")}`);
  });

  it("lists updated date as a date function", async function () {
    await this.write({ path: "/a.txt", content: "Tags: abc\n\nFoo" });
    await this.template({
      "cacheid.html": `{{cacheID}}`,
      "entries.html": `{{#updated}}YYYY-MM-DD{{/updated}}`,
    });

    const cacheID = parseInt(await this.text("/cacheid.html"));
    const d = moment.utc(cacheID).tz(this.blog.timeZone);

    const body = await this.text("/");

    expect(body.trim()).toEqual(`${d.format("YYYY-MM-DD")}`);
  });
});
