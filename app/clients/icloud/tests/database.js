const client = require("models/client-new");
const database = require("clients/icloud/database");

describe("icloud database", function () {
  global.test.blog();

  afterEach(async function () {
    await database.delete(this.blog.id);
  });

  it("returns null when no hash exists", async function () {
    const result = await database.get(this.blog.id);

    expect(result).toBeNull();
  });

  it("returns null for empty hash responses", async function () {
    spyOn(client, "hGetAll").and.resolveTo({});

    const result = await database.get(this.blog.id);

    expect(result).toBeNull();
  });

  it("tracks global set membership across store and delete", async function () {
    const data = {
      setupComplete: true,
      sharingLink: "https://example.com/shared",
      transferState: { active: false },
    };

    await database.store(this.blog.id, data);

    const stored = await database.get(this.blog.id);
    expect(stored).toEqual(data);

    const listedAfterStore = await database.list();
    expect(listedAfterStore).toContain(this.blog.id);

    const globalMembers = await client.sMembers(database._globalSetKey());
    expect(globalMembers).toContain(this.blog.id);

    await database.delete(this.blog.id);

    const listedAfterDelete = await database.list();
    expect(listedAfterDelete).not.toContain(this.blog.id);

    const globalMembersAfterDelete = await client.sMembers(database._globalSetKey());
    expect(globalMembersAfterDelete).not.toContain(this.blog.id);
  });
});
