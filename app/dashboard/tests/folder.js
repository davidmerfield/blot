describe("folder", function () {
  global.test.site({ login: true });

  it("lists the files in a folder", async function () {
    await this.write({ path: "index.html", content: "Hello world" });
    await this.write({ path: "about.html", content: "About me" });

    const sitePage = await this.text(`/sites/${this.blog.handle}`);

    expect(sitePage).toMatch("index.html");
    expect(sitePage).toMatch("about.html");

    await this.remove("index.html");

    const sitePageAfterDelete = await this.text(`/sites/${this.blog.handle}`);

    expect(sitePageAfterDelete).not.toMatch("index.html");
    expect(sitePageAfterDelete).toMatch("about.html");
  });

  const testCases = [
    " leading-space",
    "trailing-space ",
    "semi;colon",
    "asterisk*star",
    'quote"marks"',
    "single'quote",
    "app/bar.txt",
    "foo bar/space tab.txt",
    "20% luck/30% skill.txt/99% will.txt",
    "tést",
    "@@#$%^;",
    "CON",
    "nul",
    "multiple    spaces",
    "𝓤𝓷𝓲𝓬𝓸𝓭𝓮",
    "文件夹",
    "emoji-💾",
    "A_very_very_very_very_very_very_very_very_very_very_long_folder_name",
    "slash/forward",
    "pipe|pipe",
    "question?mark",
    "<>anglebrackets",
    "[brackets]",
    "{curly}",
    "(parentheses)",
    "file.name.with.dots",
    "123456",
    "UPPERCASE",
    "MiXeDcAsE",
    "-dash-start",
    "end-dash-",
    "_underscore_",
    "@at-sign",
    "#hashtag",
    "!exclaim!",
    "$dollar$",
    "percent%",
    "caret^",
    "tilde~",
    "accentèd",
    "colon:colon",
    "tab\ttab",
    "new\nline",
    "space\t\ttab",
    "[empty]",
    "duplicate",
    // Nested paths
    "tilde~/[empty]",
    "test/emoji-💾/文件夹",
    "foo bar/space\t\ttab",
    "A_very_very_very_very_very_very_very_very_very_very_long_folder_name/UPPERCASE",
    "CON/nul/pipe|pipe",
    "slash/forward/question?mark",
    "nested1/nested2/nested3/nested4",
    "emoji-💾/20% luck/[brackets]",
    "tab\ttab/new\nline",
  ];

  for (const path of testCases) {
    it(`handles path ${path}`, async function () {
      await this.write({ path, content: "test content here" });

      // first load the index page of the dashboard
      let $ = await this.parse(`/sites/${this.blog.handle}`);
      // then identify the link to the filename or the first parent directory
      // e.g. for app/bar.txt the first link is 'app'
      const components = path.split("/").filter((c) => c.length > 0);

      console.log(path, "COMPONENTS:", components);

      for (let i = 0; i < components.length; i++) {
        const component = components[i];

        console.log("NAVIGATING TO COMPONENT:", component);

        const link = $(`.directory-list a:contains("${component}")`);

        if (!link || link.length === 0) {
          console.log($(".directory-list").html());
          throw new Error(
            `Could not find link for component "${component}" in path "${path}"`
          );
        }

        const href = link.attr("href");

        $ = await this.parse(href);

        // if this is the last component, we should be on a file link
        if (i === components.length - 1) {
          // there should be a h1 with the filename
          const h1 = $("h1:contains('" + component + "')");

          if (!h1 || h1.length === 0) {
            throw new Error(
              `Could not find h1 for file "${component}" in path "${path}"`
            );
          }


          // find the file download link
          const downloadLink = $("a:contains('Download file')").attr("href");

          console.log('attempting to download file from link:', downloadLink);
          
          const text = await this.text(downloadLink);

          expect(text).toBe("test content here");
        }
      }
    });
  }
});
