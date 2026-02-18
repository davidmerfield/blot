const { convert } = require("../../plugins");

describe("plugin runner", function () {
  const blogBase = {
    domain: "example.com",
    handle: "plugin-runner",
    id: "plugin-runner-test",
  };

  function runPlugins(plugins, contents) {
    return new Promise((resolve, reject) => {
      convert(
        { ...blogBase, plugins },
        "/post.html",
        contents,
        function (err, html, dependencies) {
          if (err) return reject(err);
          resolve({ html, dependencies });
        }
      );
    });
  }

  it("collects newDependencies from plugin results", async function () {
    const plugins = { wikilinks: { enabled: true, options: {} } };
    const contents = '<a href="target" title="wikilink">wikilink</a>';

    const { dependencies } = await runPlugins(plugins, contents);

    expect(dependencies).toContain("/target");
  });

  it("ignores plugins that return no result", async function () {
    const plugins = { autoImage: { enabled: true, options: {} } };
    const contents = "<p><a href='https://example.com/image.jpg'>https://example.com/image.jpg</a></p>";

    const { dependencies } = await runPlugins(plugins, contents);

    expect(dependencies.length).toBe(0);
  });
});
