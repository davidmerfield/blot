describe("questions.update", function () {
  require("./setup")();
  const create = require("../create");
  const update = require("../update");
  const get = require("../get");
  const list = require("../list");

  it("updates a question", async function () {
    const { id } = await create({ title: "How?", body: "Yes" });
    const question = await update(id, { title: "How?", body: "No" });

    expect(question.body).toBe("No");
  });

  it("should throw an error if you update a question that does not exist", async function () {
    await expectAsync(
      update("123", { title: "How?", body: "No" })
    ).toBeRejectedWith(new Error("Question with ID 123 does not exist"));
  });

  it("removes a tag", async function () {
    const { id } = await create({ title: "1", body: "2", tags: ["a", "b"] });

    await update(id, { tags: ["a"] });

    const question = await get(id);

    delete question.replies;

    expect(question.tags).toEqual(["a"]);
    // console.log(await list({ tag: "a" }));
    // console.log([question])
    expect(await list({ tag: "a" })).toEqual({
      questions: [question],
      stats: { total: 1, page_size: 10, page: 1 },
    });
    expect(await list({ tag: "b" })).toEqual({
      questions: [],
      stats: { total: 0, page_size: 10, page: 1 },
    });
  });
});
