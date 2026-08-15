describe("dependencies", function () {
  var depedencies = require("../index");

  // tests for depedencies

  function should_get_dependencies(input) {
    it("gets dependencies from " + input.path, function () {
      var result = depedencies(input.path, input.html, input.metadata);
      expect(result).toEqual(input.result);
    });
  }

  should_get_dependencies({
    html: '<img src="./goo.jpg">',
    path: "/foo/bar.txt",
    metadata: {},
    result: {
      html: '<img src="/foo/goo.jpg">',
      metadata: {},
      dependencies: ["/foo/goo.jpg"],
    },
  });

  should_get_dependencies({
    html: '<img src="goo.jpg">',
    path: "/foo/bar.txt",
    metadata: {},
    result: {
      html: '<img src="/foo/goo.jpg">',
      metadata: {},
      dependencies: ["/foo/goo.jpg"],
    },
  });

  // Should extract absolute paths
  should_get_dependencies({
    html: '<img src="/foo/goo.jpg">',
    path: "/foo/bar.txt",
    metadata: {},
    result: {
      html: '<img src="/foo/goo.jpg">',
      metadata: {},
      dependencies: ["/foo/goo.jpg"],
    },
  });

  // Should return unique list
  should_get_dependencies({
    html: '<img src="/foo/goo.jpg"><img src="/foo/goo.jpg">',
    path: "/foo/bar.txt",
    metadata: {},
    result: {
      html: '<img src="/foo/goo.jpg"><img src="/foo/goo.jpg">',
      metadata: {},
      dependencies: ["/foo/goo.jpg"],
    },
  });

  // Lots of items
  should_get_dependencies({
    html:
      '<script type="text/javascript" src="javascript.js"></script><img src="../image.jpg"><link rel="stylesheet" type="text/css" href="/theme.css">',
    path: "/sub/folder/post.txt",
    metadata: {},
    result: {
      html:
        '<script type="text/javascript" src="/sub/folder/javascript.js"></script><img src="/sub/image.jpg"><link rel="stylesheet" type="text/css" href="/theme.css">',
      metadata: {},
      dependencies: [
        "/sub/folder/javascript.js",
        "/sub/image.jpg",
        "/theme.css",
      ],
    },
  });

  // Links are resolved exactly like src attributes, extension and
  // all: a relative link to another post's source file resolves
  // directly to that file, not to the rendered post's permalink.
  should_get_dependencies({
    html: '<a href="page.html"></a>',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<a href="/page.html"></a>',
      metadata: {},
      dependencies: ["/page.html"],
    },
  });

  // Same for a link with no extension at all
  should_get_dependencies({
    html: '<a href="other-page"></a>',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<a href="/other-page"></a>',
      metadata: {},
      dependencies: ["/other-page"],
    },
  });

  // Should resolve relative links to plain files, e.g. a link
  // directly to another post's source file (not the rendered post)
  should_get_dependencies({
    html: '<a href="other-post.md"></a>',
    path: "/folder/post.txt",
    metadata: {},
    result: {
      html: '<a href="/folder/other-post.md"></a>',
      metadata: {},
      dependencies: ["/folder/other-post.md"],
    },
  });

  // Should resolve a relative link to a local image
  should_get_dependencies({
    html: '<a href="beach.jpg">Download</a>',
    path: "/photos/vacation.txt",
    metadata: {},
    result: {
      html: '<a href="/photos/beach.jpg">Download</a>',
      metadata: {},
      dependencies: ["/photos/beach.jpg"],
    },
  });

  // Should resolve an image wrapped in a link to the same image,
  // keeping both attributes in sync (the original bug report)
  should_get_dependencies({
    html: '<a href="beach.jpg"><img src="beach.jpg"></a>',
    path: "/photos/vacation.txt",
    metadata: {},
    result: {
      html: '<a href="/photos/beach.jpg"><img src="/photos/beach.jpg"></a>',
      metadata: {},
      dependencies: ["/photos/beach.jpg"],
    },
  });

  // Should preserve a fragment appended to a resolved link
  should_get_dependencies({
    html: '<a href="report.pdf#page=3">Report</a>',
    path: "/docs/index.txt",
    metadata: {},
    result: {
      html: '<a href="/docs/report.pdf#page=3">Report</a>',
      metadata: {},
      dependencies: ["/docs/report.pdf"],
    },
  });

  // Should preserve a query string appended to a resolved link
  should_get_dependencies({
    html: '<a href="report.pdf?download=1">Report</a>',
    path: "/docs/index.txt",
    metadata: {},
    result: {
      html: '<a href="/docs/report.pdf?download=1">Report</a>',
      metadata: {},
      dependencies: ["/docs/report.pdf"],
    },
  });

  // Should not touch fragment-only hrefs, e.g. footnotes and
  // tables of contents
  should_get_dependencies({
    html: '<a href="#fn1">1</a>',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<a href="#fn1">1</a>',
      metadata: {},
      dependencies: [],
    },
  });

  // Should not touch query-only hrefs
  should_get_dependencies({
    html: '<a href="?page=2">Next</a>',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<a href="?page=2">Next</a>',
      metadata: {},
      dependencies: [],
    },
  });

  // Should not touch links which are already absolute
  should_get_dependencies({
    html: '<a href="/docs/report.pdf">Report</a>',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<a href="/docs/report.pdf">Report</a>',
      metadata: {},
      dependencies: ["/docs/report.pdf"],
    },
  });

  // Should not touch external links
  should_get_dependencies({
    html: '<a href="https://example.com/image.jpg">Image</a>',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<a href="https://example.com/image.jpg">Image</a>',
      metadata: {},
      dependencies: [],
    },
  });

  // Should not touch mailto/tel links, even with a dotted domain
  should_get_dependencies({
    html: '<a href="mailto:user@example.com">Email</a>',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<a href="mailto:user@example.com">Email</a>',
      metadata: {},
      dependencies: [],
    },
  });

  // Should not touch wikilinks (title="wikilink"), even when they
  // look like a file reference - the wikilinks plugin resolves
  // these later, from their original, unresolved target text
  should_get_dependencies({
    html: '<a href="Spec Sheet.md" title="wikilink">Spec Sheet.md</a>',
    path: "/notes/index.txt",
    metadata: {},
    result: {
      html: '<a href="Spec Sheet.md" title="wikilink">Spec Sheet.md</a>',
      metadata: {},
      dependencies: [],
    },
  });

  // Should not touch wikilink media embeds either
  should_get_dependencies({
    html: '<img src="diagram.png" title="wikilink">',
    path: "/notes/index.txt",
    metadata: {},
    result: {
      html: '<img src="diagram.png" title="wikilink">',
      metadata: {},
      dependencies: [],
    },
  });

  // SHould not extract them from URLs
  should_get_dependencies({
    html: '<img src="//google.com/goo.jpg">',
    path: "/bar.txt",
    metadata: {},
    result: {
      html: '<img src="//google.com/goo.jpg">',
      metadata: {},
      dependencies: [],
    },
  });

  // Should ignore non-file URL schemes (mailto)
  should_get_dependencies({
    html: '<img src="mailto:user@example.com">',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<img src="mailto:user@example.com">',
      metadata: {},
      dependencies: [],
    },
  });

  // Should ignore non-file URL schemes (tel)
  should_get_dependencies({
    html: '<img src="tel:+15551234567">',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<img src="tel:+15551234567">',
      metadata: {},
      dependencies: [],
    },
  });

  // Should ignore non-file URL schemes (sms)
  should_get_dependencies({
    html: '<img src="sms:+15551234567">',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<img src="sms:+15551234567">',
      metadata: {},
      dependencies: [],
    },
  });

  // SHould not consider itself a dependency
  should_get_dependencies({
    html: '<img src="/image.jpg">',
    path: "/image.jpg",
    metadata: {},
    result: {
      html: '<img src="/image.jpg">',
      metadata: {},
      dependencies: [],
    },
  });

  // Should resolve thumbnail metadata
  should_get_dependencies({
    html: "Hello",
    path: "/foo/post.txt",
    metadata: { thumbnail: "image.jpg" },
    result: {
      html: "Hello",
      metadata: { thumbnail: "/foo/image.jpg" },
      dependencies: ["/foo/image.jpg"],
    },
  });


  // Should resolve thumbnail metadata with mixed-case key
  should_get_dependencies({
    html: "Hello",
    path: "/foo/post.txt",
    metadata: { ThUmBnAiL: "image.jpg" },
    result: {
      html: "Hello",
      metadata: { ThUmBnAiL: "/foo/image.jpg" },
      dependencies: ["/foo/image.jpg"],
    },
  });

  // Should ignore thumbnail metadata which is a URL
  should_get_dependencies({
    html: "x",
    path: "/foo/post.txt",
    metadata: { thumbnail: "http://wikipedia.org/example.jpg" },
    result: {
      html: "x",
      metadata: { thumbnail: "http://wikipedia.org/example.jpg" },
      dependencies: [],
    },
  });

  // Should resolve relative path in arbritrary metadata
  should_get_dependencies({
    html: '<img src="other-image.jpg">',
    path: "/foo/post.txt",
    metadata: { title: "./image.jpg" },
    result: {
      html: '<img src="/foo/other-image.jpg">',
      metadata: { title: "/foo/image.jpg" },
      dependencies: ["/foo/image.jpg", "/foo/other-image.jpg"],
    },
  });

  // Should ignore metadata without paths
  should_get_dependencies({
    html: "Hello",
    path: "/foo/post.txt",
    metadata: { title: "image.jpg" },
    result: {
      html: "Hello",
      metadata: { title: "image.jpg" },
      dependencies: [],
    },
  });
});
