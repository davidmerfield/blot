describe("dates", function () {
  require("./util/setup")();

  const moment = require("moment");
  require("moment-timezone");

  it("renders the date of a post", async function () {
    await this.write({ path: "/a.txt", content: "Date: 2025-01-03\n\nFoo" });
    await this.template({
      "entries.html": `{{#entries}}{{date}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe("January 3, 2025");
  });

  it("respects the blog's date format setting when parsing the date of a post", async function () {
    await this.write({ path: "/a.txt", content: "Date: 01-03-2025\n\nFoo" });
    await this.template({
      "entries.html": `{{#entries}}{{date}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe("January 3, 2025");

    // default date format is "M/D/YYYY"
    await this.blog.update({ dateFormat: "D/M/YYYY" });
    await this.blog.rebuild();

    expect(await this.text("/")).toBe("March 1, 2025");
  });

  it("respects the template's date display setting", async function () {
    await this.write({ path: "/a.txt", content: "Date: 2025-01-03\n\nFoo" });
    await this.template(
      {
        "entries.html": `{{#entries}}{{{date}}}{{/entries}}`,
      },
      {
        locals: { date_display: "M/D/YYYY" },
      }
    );

    expect(await this.text("/")).toBe("1/3/2025");
  });

  it("preserves the date computed from metadata, even after removing the metadata", async function () {
    await this.write({ path: "/a.txt", content: "Date: 2025-01-03\n\nFoo" });
    await this.template({
      "entries.html": `{{#entries}}{{date}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe("January 3, 2025");

    // now remove the date metadata and rebuild
    await this.write({ path: "/a.txt", content: "Foo" });
    await this.blog.rebuild();

    expect(await this.text("/")).toBe("January 3, 2025");
  });

  it("respects the template's hide_dates setting", async function () {
    await this.write({ path: "/a.txt", content: "Date: 2025-01-03\n\nFoo" });
    await this.template(
      {
        "entries.html": `{{#entries}}{{date}}{{/entries}}`,
      },
      {
        locals: { hide_dates: true },
      }
    );

    expect(await this.text("/")).toBe("");
  });

  it("extracts a publish date from the post's filename", async function () {
    await this.write({ path: "/2025-02-04-a.txt", content: "Foo" });

    await this.template({
      "entries.html": `{{#entries}}{{date}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe("February 4, 2025");
  });

  it("extracts a publish date from the post's filepath", async function () {
    await this.write({ path: "/2025/02-04-a.txt", content: "Foo" });
    await this.write({ path: "/2025/02/04-b.txt", content: "Bar" });
    await this.write({ path: "/2025-02/04-c.txt", content: "Baz" });
    await this.write({ path: "/2025/02/04/c.txt", content: "Baz" });

    await this.template({
      "entries.html": `{{#entries}}{{date}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe(
      new Array(4).fill("February 4, 2025").join("")
    );
  });

  it("uses the post's creation date as publish date when no date metadata is set", async function () {
    await this.write({ path: "/a.txt", content: "Foo" });

    await this.template({
      "entries.html": `{{#entries}}{{dateStamp}} - {{created}}{{/entries}}`,
    });

    const dates = await this.text("/");

    // should be 'timestamp - timestamp'
    expect(dates).toMatch(/^[\w\s,:]+ - [\w\s,:]+$/);

    const publishDate = new Date(dates.split(" - ")[0]);
    const createDate = new Date(dates.split(" - ")[1]);

    // the publish date and create date should be the same
    expect(publishDate.toDateString()).toBe(createDate.toDateString());
  });

  it("prefers the post's date metadata over the filename date", async function () {
    await this.write({
      path: "/2025-02-04-a.txt",
      content: "Date: 2025-03-05\n\nFoo",
    });

    await this.template({
      "entries.html": `{{#entries}}{{date}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe("March 5, 2025");
  });

  it("updates the entry's updated property when the post is modified", async function () {
    const before = new Date();
    await this.write({ path: "/a.txt", content: "Foo" });

    await this.template({
      "entries.html": `{{#entries}}{{updated}}{{/entries}}`,
    });

    const firstUpdated = new Date(parseInt(await this.text("/")));
    await this.write({ path: "/a.txt", content: "Bar" });
    const secondUpdated = new Date(parseInt(await this.text("/")));
    const after = new Date();

    console.log({ before, firstUpdated, secondUpdated, after });

    expect(firstUpdated >= before).toBe(true);
    expect(secondUpdated >= firstUpdated).toBe(true);
    expect(secondUpdated <= after).toBe(true);
  });

  it("does not change entry created date on modification", async function () {
    await this.write({ path: "/a.txt", content: "Foo" });

    await this.template({
      "entries.html": `{{#entries}}{{created}}{{/entries}}`,
    });

    const firstCreated = new Date(parseInt(await this.text("/")));

    await this.write({ path: "/a.txt", content: "Bar" });

    const secondCreated = new Date(parseInt(await this.text("/")));
    expect(secondCreated.getTime()).toBe(firstCreated.getTime());
  });

  it("returns integer timestamps for dateStamp, created, and updated", async function () {
    const before = Date.now();
    await this.write({ path: "/a.txt", content: "Foo" });

    await this.template({
      "entries.html": `{{#entries}}{{dateStamp}} - {{created}} - {{updated}}{{/entries}}`,
    });

    const dates = await this.text("/");

    const [dateStamp, created, updated] = dates.split(" - ").map((ts) => {
      const n = parseInt(ts);
      expect(typeof n).toBe("number");
      return n;
    });

    // all created should match dateStamp, and updated should be after created
    // since updated is set at write time and created is set at build time
    expect(dateStamp).toBe(created, "created should match dateStamp");
    expect(updated < created).toBe(true, "updated should be before created");

    const after = Date.now();

    // timestamps should be within the before/after range
    expect(dateStamp >= before).toBe(true);
    expect(dateStamp <= after).toBe(true);
  });

  it("supports the formatDate helper", async function () {
    await this.write({ path: "/a.txt", content: "Date: 2025-01-03\n\nFoo" });

    await this.template({
      "entries.html": `{{#entries}}{{#formatDate}}YY MMM Do{{/formatDate}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe("25 Jan 3rd");
  });

  it("supports the formatUpdated helper", async function () {
    const before = Date.now();
    await this.write({ path: "/a.txt", content: "Foo" });

    await this.template({
      "entries.html": `{{#entries}}{{#formatUpdated}}YY MMM Do{{/formatUpdated}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe(moment(before).format("YY MMM Do"));
  });

  it("supports the formatCreated helper", async function () {
    const before = Date.now();
    await this.write({ path: "/a.txt", content: "Foo" });

    await this.template({
      "entries.html": `{{#entries}}{{#formatCreated}}YY MMM Do{{/formatCreated}}{{/entries}}`,
    });

    expect(await this.text("/")).toBe(moment(before).format("YY MMM Do"));
  });

  // test timezone interaction with dates
  it("respects the blog's timezone setting when rendering dates", async function () {
    await this.template({
      "entries.html": `{{#entries}}{{#formatDate}}YYYY-MM-DD HH:mm{{/formatDate}}{{/entries}}`,
    });
    await this.blog.update({ timeZone: "Asia/Tokyo" });

    // When you remove date from metadata, it should use created date adjusted for timezone
    const createTime = Date.now();
    await this.write({ path: "/a.txt", content: "Foo" });

    // In Tokyo timezone, created date should be adjusted accordingly
    const createdDateTokyo = moment
      .utc(createTime)
      .tz("Asia/Tokyo")
      .format("YYYY-MM-DD HH:mm");

    expect(await this.text("/")).toBe(createdDateTokyo);

    // Change timezone to America/New_York
    await this.blog.update({ timeZone: "America/New_York" });
    await this.blog.rebuild();

    const createdDateNY = moment
      .utc(createTime)
      .tz("America/New_York")
      .format("YYYY-MM-DD HH:mm");

    expect(await this.text("/")).toBe(createdDateNY);

    // However, when you use a date in metadata, it should remain constant regardless of timezone
    await this.write({
      path: "/a.txt",
      content: "Date: 2025-06-15 23:00\n\nFoo",
    });

    expect(await this.text("/")).toBe("2025-06-15 23:00");

    await this.blog.update({ timeZone: "America/New_York" });
    await this.blog.rebuild();

    // Timezone should not affect the displayed date/time in this case
    expect(await this.text("/")).toBe("2025-06-15 23:00");

    // Change timezone to Asia/Tokyo
    await this.blog.update({ timeZone: "Asia/Tokyo" });
    await this.blog.rebuild();

    // Timezone should not affect the displayed date/time in this case
    expect(await this.text("/")).toBe("2025-06-15 23:00");
  });
});
