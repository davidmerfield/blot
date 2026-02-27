describe("questions.search", function () {
  require("./setup")();

  const create = require("../create");
  const search = require("../search");

  it("returns no results when appropriate", async function () {
    const results = await search({ query: "how" });

    expect(results.length).toBe(0);
  });

  it("returns results", async function () {
    await create({ title: "How", body: "Yes" });
    await create({ title: "Now", body: "Yes" });
    await create({ title: "Brown", body: "Yes" });

    const results = await search({ query: "how" });

    // each result should have only the properties 'title' and 'id'
    results.forEach(result => {
      expect(Object.keys(result).sort()).toEqual(["id", "score", "title"]);
    });

    expect(results.length).toBe(1);
  });

  it("paginates results", async function () {
    for (let i = 0; i < 15; i++) {
      await create({ title: "How", body: "Yes" });
    }

    const firstPage = await search({ query: "how", page: 1, page_size: 10 });
    const secondPage = await search({ query: "how", page: 2, page_size: 10 });

    expect(firstPage.length).toBe(10);
    expect(secondPage.length).toBe(5);
  });

  it("scores the title higher than the body", async function () {
    const one = await create({ title: "How", body: "Cow" });
    const two = await create({ title: "Now", body: "Cow" });
    const three = await create({ title: "Cow", body: "Yes" });

    const results = await search({ query: "cow" });

    expect(results.length).toBe(3);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBe(results[2].score);
    expect(results[0].id).toBe(three.id);
  });

  it("checks replies", async function () {
    const one = await create({ title: "One", body: "Hello" });
    const reply = await create({ body: "Test", parent: one.id });

    const results = await search({ query: "test" });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe(one.id);
  });

  it("omits questions with empty bodies", async function () {
    const emptyBody = await create({ title: "How", body: "   " });
    const valid = await create({ title: "How", body: "Yes" });

    const results = await search({ query: "how" });

    const ids = results.map(result => result.id);
    expect(ids).toContain(valid.id);
    expect(ids).not.toContain(emptyBody.id);
  });

  it("ignores replies with empty bodies", async function () {
    const withoutReplyMatch = await create({ title: "One", body: "Hello" });
    await create({ body: "   ", parent: withoutReplyMatch.id });

    const withReplyMatch = await create({ title: "Two", body: "Hello" });
    await create({ body: "Test reply", parent: withReplyMatch.id });

    const results = await search({ query: "test" });

    expect(results.length).toBe(1);
    expect(results[0].id).toBe(withReplyMatch.id);
  });
  it("handles an empty sScanIterator", async function () {
    const client = require("models/client");

    spyOn(client, "sScanIterator").and.returnValue((async function* () {})());
    const zrangeSpy = spyOn(client, "zrange").and.callThrough();
    const hgetallSpy = spyOn(client, "hgetall").and.callThrough();

    const results = await search({ query: "how" });

    expect(results).toEqual([]);
    expect(zrangeSpy).not.toHaveBeenCalled();
    expect(hgetallSpy).not.toHaveBeenCalled();
  });

  it("collects results across multiple sScanIterator pages", async function () {
    const client = require("models/client");

    spyOn(client, "sScanIterator").and.returnValue((async function* () {
      yield ["1"];
      yield ["2"];
    })());

    spyOn(client, "zrange").and.returnValue(Promise.resolve([]));
    spyOn(client, "hgetall").and.callFake((key) => {
      const id = key.split(":").pop();
      return Promise.resolve({ id, title: `How ${id}`, body: "Yes" });
    });

    const results = await search({ query: "how" });

    expect(results.length).toBe(2);
    expect(results.map((result) => result.id).sort()).toEqual(["1", "2"]);
  });

  it("stops iterating once enough results fill the requested page", async function () {
    const client = require("models/client");
    let pulls = 0;

    spyOn(client, "sScanIterator").and.returnValue((async function* () {
      pulls += 1;
      yield ["1"];
      pulls += 1;
      yield ["2"];
    })());

    spyOn(client, "zrange").and.returnValue(Promise.resolve([]));
    spyOn(client, "hgetall").and.callFake((key) => {
      const id = key.split(":").pop();
      return Promise.resolve({ id, title: `How ${id}`, body: "Yes" });
    });

    const results = await search({ query: "how", page: 1, page_size: 1 });

    expect(results.length).toBe(1);
    expect(pulls).toBe(1);
  });

});
