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

  // SHould not mess with links
  should_get_dependencies({
    html: '<a href="page.html"></a>',
    path: "/post.txt",
    metadata: {},
    result: {
      html: '<a href="page.html"></a>',
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
