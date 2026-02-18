const { convert } = require("../../plugins");

describe("typeset plugin", function () {
  const blogBase = {
    domain: "example.com",
    handle: "typeset-plugin",
    id: "typeset-plugin-test"
  };

  function runTypeset(options, html, callback) {
    convert(
      {
        ...blogBase,
        plugins: {
          typeset: {
            enabled: true,
            options
          }
        }
      },
      "/post.html",
      html,
      callback
    );
  }

  it("treats string false values as disabled for punctuation and small caps", function (done) {
    const input = '<p>He said "Hello" -- and NASA.</p>';

    runTypeset(
      {
        punctuation: "false",
        smallCaps: "false"
      },
      input,
      function (err, output) {
        if (err) return done.fail(err);

        expect(output).toContain('" -- and NASA.');
        expect(output).not.toContain("“");
        expect(output).not.toContain('class="small-caps"');
        done();
      }
    );
  });

  it("treats string true values as enabled for punctuation and small caps", function (done) {
    const input = '<p>He said "Hello" -- and NASA.</p>';

    runTypeset(
      {
        punctuation: "true",
        smallCaps: "true"
      },
      input,
      function (err, output) {
        if (err) return done.fail(err);

        expect(output.includes("“")).toBe(true);
        expect(output.includes('class="small-caps"')).toBe(true);
        expect(output).not.toContain('" -- and NASA.');
        done();
      }
    );
  });
});
