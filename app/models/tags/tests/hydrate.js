describe("tags._hydrate", function () {
  // Create a test user and blog before each spec
  global.test.blog();

  const client = require("models/client");
  const key = require("../key");
  const hydrate = require("../_hydrate");
  const { promisify } = require("util");
  const zrevrange = promisify(client.zrevrange).bind(client);
  const del = promisify(client.del).bind(client);

  it("populates sorted tag sets from tag sets", async function () {
    await this.publish({
      path: "/entry-1.txt",
      content: "Tags: A, B, C\n\nEntry 1",
    });

    await this.publish({
      path: "/entry-2.txt",
      content: "Tags: B, C\n\nEntry 2",
    });

    await this.publish({
      path: "/entry-3.txt",
      content: "Tags: C\n\nEntry 3",
    });

    // Delete sorted tag sets
    await del(
      key.sortedTag(this.blog.id, "a"),
      key.sortedTag(this.blog.id, "b"),
      key.sortedTag(this.blog.id, "c")
    );

    // Hydrate sorted tag sets
    await hydrate(this.blog.id);

    // Check sorted tag set for tag C
    const entryIDsC = await zrevrange(key.sortedTag(this.blog.id, "c"), 0, -1);

    expect(entryIDsC).toEqual(["/entry-3.txt", "/entry-2.txt", "/entry-1.txt"]);

    // Check sorted tag set for tag B
    const entryIDsB = await zrevrange(key.sortedTag(this.blog.id, "b"), 0, -1);

    expect(entryIDsB).toEqual(["/entry-2.txt", "/entry-1.txt"]);

    // Check sorted tag set for tag A
    const entryIDsA = await zrevrange(key.sortedTag(this.blog.id, "a"), 0, -1);

    expect(entryIDsA).toEqual(["/entry-1.txt"]);
  });
});
