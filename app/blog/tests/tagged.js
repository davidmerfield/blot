const Entries = require("models/entries");

describe("tags work on sites", function () {
  require("./util/setup")();

  it("lists entries in reverse chronological", async function () {
    await this.publish({ path: "/first.txt", content: "Tags: A\n\nFoo" });
    await this.publish({ path: "/second.txt", content: "Tags: A,B\n\nBar" });
    await this.publish({ path: "/third.txt", content: "Tags: B,C\n\nBaz" });

    await this.template({
      "tagged.html": "{{#entries}}{{title}} {{/entries}}",
    });

    const res = await this.get(`/tagged/a`);

    expect((await res.text()).trim().toLowerCase()).toEqual("second first");
  });

  it("renders overlapping tag feeds independently", async function () {
    await this.publish({ path: "/first.txt", content: "Tags: A\n\nFoo" });
    await this.publish({ path: "/second.txt", content: "Tags: A,B\n\nBar" });
    await this.publish({ path: "/third.txt", content: "Tags: B\n\nBaz" });

    await this.template({
      "tagged.html": "{{#entries}}{{title}}\n{{/entries}}",
    });

    const getTitles = async (slug) => {
      const res = await this.get(`/tagged/${slug}`);
      expect(res.status).toBe(200);
      const body = (await res.text()).trim();
      return body ? body.split(/\n+/).map((title) => title.toLowerCase()) : [];
    };

    await expectAsync(getTitles("a")).toBeResolvedTo(["second", "first"]);
    await expectAsync(getTitles("b")).toBeResolvedTo(["third", "second"]);
  });

  it("excludes entries without tags from tagged feeds", async function () {
    await this.publish({
      path: "/untagged.txt",
      content: "Title: Untagged\n\nJust content",
    });
    await this.publish({
      path: "/with-tag.txt",
      content: "Title: With Tag\nTags: Solo\n\nHas a tag",
    });

    await this.template({
      "tagged.html": "{{#entries}}{{title}}\n{{/entries}}",
    });

    const res = await this.get(`/tagged/solo`);
    const titles = (await res.text()).trim().split(/\n+/).filter(Boolean);

    expect(res.status).toBe(200);
    expect(titles.map((title) => title.toLowerCase())).toEqual(["with tag"]);
  });

  it("normalizes multi-word tag slugs and preserves pretty casing", async function () {
    await this.publish({
      path: "/first-multi.txt",
      content: "Title: First Multi\nTags: Multi Word\n\nBody",
    });
    await this.publish({
      path: "/second-multi.txt",
      content: "Title: Second Multi\nTags: Multi Word\n\nBody",
    });

    await this.template({
      "tagged.html": "{{tag}}\n{{#entries}}{{title}}\n{{/entries}}",
    });

    const res = await this.get(`/tagged/multi%20word`);
    const lines = (await res.text()).trim().split(/\n+/).filter(Boolean);

    expect(res.status).toBe(200);
    expect(lines[0]).toBe("Multi Word");
    expect(lines.slice(1).map((title) => title.toLowerCase())).toEqual([
      "second multi",
      "first multi",
    ]);
  });

  it("matches tags case-insensitively while keeping pretty names", async function () {
    await this.publish({
      path: "/mixed.txt",
      content: "Title: Mixed One\nTags: MixedCase\n\nFirst",
    });
    await this.publish({
      path: "/mixed-two.txt",
      content: "Title: Mixed Two\nTags: MixedCase\n\nSecond",
    });

    await this.template({
      "tagged.html": "{{tag}}\n{{#entries}}{{title}}\n{{/entries}}",
    });

    const lower = await this.get(`/tagged/mixedcase`);
    const upper = await this.get(`/tagged/MIXEDCASE`);

    const parse = async (res) => {
      const lines = (await res.text()).trim().split(/\n+/).filter(Boolean);
      return {
        tag: lines[0],
        titles: lines.slice(1).map((title) => title.toLowerCase()),
      };
    };

    const lowerParsed = await parse(lower);
    const upperParsed = await parse(upper);

    expect(lower.status).toBe(200);
    expect(upper.status).toBe(200);
    expect(lowerParsed.tag).toBe("MixedCase");
    expect(upperParsed).toEqual(lowerParsed);
    expect(lowerParsed.titles).toEqual(["mixed two", "mixed one"]);
  });

  it("returns an empty list for unknown tags", async function () {
    await this.template({
      "tagged.html": "Total: {{total}}\n{{#entries}}{{title}}\n{{/entries}}",
    });

    const res = await this.get(`/tagged/does-not-exist`);
    const lines = (await res.text()).trim().split(/\n+/).filter(Boolean);

    expect(res.status).toBe(200);
    expect(lines[0]).toBe("Total: 0");
    expect(lines.length).toBe(1);
  });

  it("ignores improperly encoded tag slugs", async function () {
    await this.publish({
      path: "/encoded.txt",
      content: "Title: Encoded\nTags: Multi Word\n\nBody",
    });

    await this.template({
      "tagged.html": "Total: {{total}}\n{{#entries}}{{title}}\n{{/entries}}",
    });

    const res = await this.get(`/tagged/multi%2520word`);
    const lines = (await res.text()).trim().split(/\n+/).filter(Boolean);

    expect(res.status).toBe(200);
    expect(lines[0]).toBe("Total: 0");
    expect(lines.length).toBe(1);
  });

  it("keeps entries retrieval stable when tags change", async function () {
    const fetchEntryIDs = () =>
      new Promise((resolve, reject) => {
        Entries.get(
          this.blog.id,
          { lists: ["entries"], skinny: true },
          (err, lists) => {
            if (err) return reject(err);
            resolve(lists.entries.map((entry) => entry.id));
          }
        );
      });

    await this.publish({
      path: "/flux.txt",
      content: "Title: Flux\nTags: Start\n\nInitial",
    });

    await this.template({
      "tagged.html": "{{#entries}}{{title}}\n{{/entries}}",
    });

    const initialIDs = await fetchEntryIDs();
    const tagged = await this.get(`/tagged/start`);
    expect(initialIDs).toEqual(["/flux.txt"]);
    expect((await tagged.text()).trim().toLowerCase()).toBe("flux");

    await this.publish({
      path: "/flux.txt",
      content: "Title: Flux\n\nUpdated",
    });

    const afterRemovalIDs = await fetchEntryIDs();
    const removed = await this.get(`/tagged/start`);
    expect(afterRemovalIDs).toEqual(initialIDs);
    expect((await removed.text()).trim()).toBe("");

    await this.publish({
      path: "/flux.txt",
      content: "Title: Flux\nTags: Start,Again\n\nReapplied",
    });

    const afterReapplyIDs = await fetchEntryIDs();
    const restored = await this.get(`/tagged/start`);
    expect(afterReapplyIDs).toEqual(initialIDs);
    expect((await restored.text()).trim().toLowerCase()).toBe("flux");
  });
});
