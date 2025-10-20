describe("sync", function () {
  const Entry = require("models/entry");
  const client = require("models/client");
  const rebuild = require("sync/rebuild");

  require("./util/setup")();

  it("rebuilds missing entry data without crashing", async function () {
    const path = "/Ghost.txt";

    await this.write({ path, content: "Hello" });
    await this.blog.rebuild();
    await this.blog.check({ path });

    const entryKey = Entry.key.entry(this.blog.id, path);

    await new Promise((resolve, reject) => {
      client.del(entryKey, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    await new Promise((resolve, reject) => {
      rebuild(this.blog.id, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const rebuiltEntry = await this.blog.check({ path });
    expect(rebuiltEntry).toBeDefined();
    expect(rebuiltEntry.path).toEqual(path);
  });
});
