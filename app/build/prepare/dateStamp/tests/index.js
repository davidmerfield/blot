const dateStamp = require("..");

describe("dateStamp", function () {
  it("reads Date metadata with mixed-case key", function () {
    const blog = { id: "test", dateFormat: "M/D/YYYY", timeZone: "Etc/UTC" };
    const metadata = { Date: "2019-04-03 12:33:15" };

    expect(dateStamp(blog, "/post.txt", metadata)).toEqual(1554294795000);
  });

  describe("using the time from the entry's creation date", function () {
    const blog = { id: "test", dateFormat: "M/D/YYYY", timeZone: "Etc/UTC" };

    it("uses the time of day from previousCreated when the metadata date has no time and falls on the same day", function () {
      const metadata = { Date: "12/12/2025" };
      // 2025-12-12 15:30:00 UTC
      const previousCreated = Date.UTC(2025, 11, 12, 15, 30, 0);

      expect(dateStamp(blog, "/post.txt", metadata, previousCreated)).toEqual(
        Date.UTC(2025, 11, 12, 15, 30, 0)
      );
    });

    it("leaves the date at midnight when there is no previousCreated", function () {
      const metadata = { Date: "12/12/2025" };

      expect(dateStamp(blog, "/post.txt", metadata)).toEqual(
        Date.UTC(2025, 11, 12, 0, 0, 0)
      );
    });

    it("leaves the date at midnight when previousCreated falls on a different day", function () {
      const metadata = { Date: "12/12/2025" };
      // Entry was first created a day earlier - the metadata date was
      // likely edited after the fact, so don't graft on an unrelated time.
      const previousCreated = Date.UTC(2025, 11, 11, 15, 30, 0);

      expect(dateStamp(blog, "/post.txt", metadata, previousCreated)).toEqual(
        Date.UTC(2025, 11, 12, 0, 0, 0)
      );
    });

    it("does not override a time explicitly set in the metadata", function () {
      const metadata = { Date: "2025-12-12 09:15" };
      const previousCreated = Date.UTC(2025, 11, 12, 15, 30, 0);

      expect(dateStamp(blog, "/post.txt", metadata, previousCreated)).toEqual(
        Date.UTC(2025, 11, 12, 9, 15, 0)
      );
    });

    it("falls back to path/undefined when the date metadata is removed, ignoring previousCreated", function () {
      const previousCreated = Date.UTC(2025, 11, 12, 15, 30, 0);

      expect(dateStamp(blog, "/post.txt", {}, previousCreated)).toEqual(
        undefined
      );
    });
  });
});
