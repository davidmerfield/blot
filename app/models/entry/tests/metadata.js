describe("entry metadata casing", function () {
  require("./setup")();

  const redis = require("models/client");
  const entryKey = require("../key").entry;

  it("preserves original metadata casing in storage and runtime", async function (done) {
    const path = "/aliases.txt";
    const contents = ["Page: yes", "CustomKey: Value", "", "# Title"].join("\n");

    const entry = await this.set(path, contents);

    expect(Object.keys(entry.metadata)).toEqual(["Page", "CustomKey"]);
    expect(entry.metadata.Page).toEqual("yes");
    expect(entry.metadata.page).toBeUndefined();
    expect(entry.metadata.CustomKey).toEqual("Value");
    expect(entry.metadata.customkey).toBeUndefined();

    const serialized = JSON.parse(JSON.stringify(entry.metadata));
    expect(serialized).toEqual({
      Page: "yes",
      CustomKey: "Value"
    });

    const raw = await new Promise((resolve, reject) => {
      redis.get(entryKey(this.blog.id, path), function (err, value) {
        if (err) return reject(err);
        resolve(value);
      });
    });

    const storedMetadata = JSON.parse(raw).metadata;
    expect(Object.keys(storedMetadata)).toEqual(["Page", "CustomKey"]);
    expect(storedMetadata.Page).toEqual("yes");
    expect(storedMetadata.CustomKey).toEqual("Value");
    expect(storedMetadata.page).toBeUndefined();
    expect(storedMetadata.customkey).toBeUndefined();

    done();
  });
});
