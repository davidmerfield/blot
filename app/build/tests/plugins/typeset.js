describe("typeset plugin", function () {
  require("./util/setup")();

  beforeEach(function () {
    this.blog.plugins.typeset = {
      enabled: true,
      options: {
        punctuation: "off",
        smallCaps: "false",
        hangingPunctuation: true,
      },
    };
  });

  afterEach(function () {
    this.blog.plugins.typeset = {
      enabled: true,
      options: {
        hangingPunctuation: true,
        punctuation: true,
        smallCaps: true,
      },
    };
  });

  it("disables punctuation and small caps when option strings are falsey", function (done) {
    const path = "/typeset.txt";
    const contents = '"NASA"';
    const html = '<p>"NASA"</p>';

    this.buildAndCheck({ path, contents }, { html }, done);
  });
});
