const dateStamp = require("..");

describe("dateStamp", function () {
  it("reads Date metadata with mixed-case key", function () {
    const blog = { id: "test", dateFormat: "M/D/YYYY", timeZone: "Etc/UTC" };
    const metadata = { Date: "2019-04-03 12:33:15" };

    expect(dateStamp(blog, "/post.txt", metadata)).toEqual(1554294795000);
  });
});
