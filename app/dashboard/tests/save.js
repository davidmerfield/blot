describe("dashboard site settings save", function () {
  const Blog = require("models/blog");

  global.test.site({ login: true });

  it("does not pass protected request fields to Blog.set", async function () {
    spyOn(Blog, "set").and.callThrough();

    await this.submit(`/sites/${this.blog.handle}/settings/date`, {
      dateFormat: "MM/DD/YYYY",
      id: "attacker-controlled-id",
      owner: "attacker-controlled-owner",
      cacheID: "12345",
    });

    expect(Blog.set).toHaveBeenCalled();

    const updates = Blog.set.calls.mostRecent().args[1];

    expect(updates.dateFormat).toBe("MM/DD/YYYY");
    expect(Object.keys(updates)).not.toContain("id");
    expect(Object.keys(updates)).not.toContain("owner");
    expect(Object.keys(updates)).not.toContain("cacheID");
  });
});
