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
