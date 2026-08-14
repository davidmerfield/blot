describe("duplicate template route", function () {
  global.test.blog();

  const Template = require("models/template");
  const duplicateTemplate = require("../save/duplicate-template");

  beforeEach(function (done) {
    const test = this;
    const name = "Original";

    Template.create(test.blog.id, name, {}, function (err) {
      if (err) return done.fail(err);

      Template.getTemplateList(test.blog.id, function (err, templates) {
        if (err) return done.fail(err);

        test.originalTemplate = templates.filter(function (template) {
          return template.name === name;
        })[0];

        done();
      });
    });
  });

  it("stores a slug which matches the id, even for long names", async function () {
    // writeToFolder names the template's directory after the stored slug and
    // readFromFolder turns that name back into an id. If the two disagree, a
    // locally edited duplicate can be read back as the template it came from
    // and overwrite it.
    const name = "My extremely long template name for testing";

    await new Promise((resolve, reject) => {
      Template.create(this.blog.id, name, {}, (err) =>
        err ? reject(err) : resolve()
      );
    });

    const templates = await new Promise((resolve, reject) => {
      Template.getTemplateList(this.blog.id, (err, list) =>
        err ? reject(err) : resolve(list)
      );
    });

    const original = templates.find((t) => t.name === name);
    const copy = await duplicateTemplate({ owner: this.blog.id, template: original });

    expect(copy.slug).toEqual(copy.id.split(":").slice(1).join(":"));

    // And again once deduplication has had to trim the name
    const second = await duplicateTemplate({ owner: this.blog.id, template: original });

    expect(second.id).not.toEqual(copy.id);
    expect(second.slug).toEqual(second.id.split(":").slice(1).join(":"));
  });

  it("deduplicates subsequent copies", async function () {
    const firstCopy = await duplicateTemplate({
      owner: this.blog.id,
      template: this.originalTemplate,
    });

    expect(firstCopy.name).toEqual("Original copy");
    expect(firstCopy.slug).toEqual("original-copy");

    const secondCopy = await duplicateTemplate({
      owner: this.blog.id,
      template: this.originalTemplate,
    });

    expect(secondCopy.name).toEqual("Original copy 2");
    expect(secondCopy.slug).toEqual("original-copy-2");

    const thirdCopy = await duplicateTemplate({
      owner: this.blog.id,
      template: this.originalTemplate,
    });

    expect(thirdCopy.name).toEqual("Original copy 3");
    expect(thirdCopy.slug).toEqual("original-copy-3");
  });
});
