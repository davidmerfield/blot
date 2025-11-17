describe("express-mustache parse", function () {
  const parse = require("../parse");
  const is = require("helper/tests/util/is")(parse);

  it("works", async function () {
    is(`Hey {{name}} {{> header}}`, {
      partials: ["header"],
      locals: ["name"],
    });

    is(`{{#name}} {{.}} {{> header}} {{/name}}`, {
      partials: ["header"],
      locals: ["name"],
    });
    is(
      `{{> header}} {{#name}} {{first}} {{last}} {{/name}} {{> footer}} {{> header}}`,
      {
        partials: ["header", "footer"],
        locals: ["name", "first", "last"],
      }
    );
  });
});
