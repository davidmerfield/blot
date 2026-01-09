describe("replaceFolderLinks", function () {
  require("blog/tests/util/setup")();

  const config = require("config");
  const fs = require("fs-extra");
  const cdnRegex = (path) =>
    new RegExp(
      `${config.cdn.origin}/folder/v-[a-f0-9]{8}/blog_[a-f0-9]+${path}`
    );

  it("should replace src attributes with versioned CDN URLs", async function () {
    await this.write({ path: "/images/test.jpg", content: "fake image data" });
    await this.template({
      "entries.html": '<img src="/images/test.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(
      new RegExp(
        `<img src="${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/images/test.jpg">`
      )
    );
  });

  it("should be case-insensitive", async function () {
    await this.write({ path: "/Images/Test.jpg", content: "fake image data" });
    await this.template({
      "entries.html": '<img src="/iMaGeS/TeSt.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(
      new RegExp(
        `<img src="${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/Images/Test.jpg">`
      )
    );
  });

  it("should change the CDN url if the source file changes", async function () {
    await this.write({ path: "/test.jpg", content: "image 1" });
    await this.template({ "entries.html": '<img src="/test.jpg">' });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(cdnRegex("/test.jpg"));

    const version = result.match(/v-[a-f0-9]{8}/)[0];

    // wait one second to ensure the file is written at a different time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await this.write({ path: "/test.jpg", content: "image 2" });

    const res2 = await this.get("/");
    const result2 = await res2.text();

    expect(result2).toMatch(cdnRegex("/test.jpg"));

    const version2 = result2.match(/v-[a-f0-9]{8}/)[0];

    expect(version2).not.toEqual(version);
  });

  it("should leave code blocks as-is", async function () {
    await this.write({ path: "/docs/test.pdf", content: "fake pdf data" });
    await this.write({
      path: "/post.txt",
      content: '```html\n<a href="/docs/test.pdf">Download</a>\n```',
    });
    await this.template({
      "entries.html": "{{#entries}}{{{html}}}{{/entries}}",
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).not.toContain(config.cdn.origin);
    expect(result).toContain(
      '<span class="hljs-string">"/docs/test.pdf"</span>'
    );
  });

  it("should replace src attributes with full qualified URLs to the blog custom domain", async function () {
    await this.write({ path: "/images/test.jpg", content: "fake image data" });
    await this.blog.update({
      domain: "example.com",
      redirectSubdomain: false,
    });

    await this.template({
      "entries.html": '<img src="https://example.com/images/test.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(
      new RegExp(
        `<img src="${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/images/test.jpg">`
      )
    );

    // handle www subdomain
    await this.template({
      "entries.html": '<img src="https://www.example.com/images/test.jpg">',
    });

    const res2 = await this.get("/");

    expect(await res2.text()).toMatch(
      new RegExp(
        `<img src="${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/images/test.jpg">`
      )
    );
  });

  it("should replace src attributes with full qualified URLs to the blog subdomain", async function () {
    await this.write({ path: "/images/test.jpg", content: "fake image data" });
    await this.template({
      "entries.html":
        '<img src="https://' +
        this.blog.handle +
        "." +
        config.host +
        '/images/test.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(
      new RegExp(
        `<img src="${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/images/test.jpg">`
      )
    );

    await this.template({
      "entries.html":
        '<img src="https://www.' +
        this.blog.handle +
        "." +
        config.host +
        '/images/test.jpg">',
    });

    const res2 = await this.get("/");
    const result2 = await res2.text();

    expect(result2).toMatch(
      new RegExp(
        `<img src="${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/images/test.jpg">`
      )
    );
  });


  it("should replace href attributes with versioned CDN URLs", async function () {
    await this.write({ path: "/docs/test.pdf", content: "fake pdf data" });
    await this.template({
      "entries.html": '<a href="/docs/test.pdf">Download</a>',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(
      new RegExp(
        `<a href="${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^"]+/docs/test.pdf">Download</a>`
      )
    );
  });

  it("should not modify HTML file links", async function () {
    await this.template({
      "entries.html": '<a href="/page.html">Link</a>',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toEqual('<a href="/page.html">Link</a>');
  });

  it("should handle multiple replacements in the same document", async function () {
    await this.write({ path: "/img1.jpg", content: "image1" });
    await this.write({ path: "/img2.jpg", content: "image2" });
    await this.template({
      "entries.html": '<div><img src="/img1.jpg"><img src="/img2.jpg"></div>',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(
      new RegExp(`${config.cdn.origin}/folder/v-[a-f0-9]{8}`)
    );
    expect(
      result.match(new RegExp(`${config.cdn.origin}/folder/v-[a-f0-9]{8}`, "g"))
        .length
    ).toEqual(2);
  });

  it("should preserve full HTML document structure", async function () {
    await this.write({ path: "/test.jpg", content: "image" });
    await this.template({
      "entries.html": `
                  <!DOCTYPE html>
                  <html>
                      <head><title>Test</title></head>
                      <body><img src="/test.jpg"></body>
                  </html>
              `.trim(),
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(/<!DOCTYPE html>/);
    expect(result).toMatch(/<html>/);
    expect(result).toMatch(/<head>/);
    expect(result).toMatch(/<body>/);
    expect(result).toMatch(
      new RegExp(`${config.cdn.origin}/folder/v-[a-f0-9]{8}`)
    );
  });

  it("should handle missing files gracefully, even across multiple requests", async function () {
    await this.template({
      "entries.html": '<img src="/nonexistent.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toEqual('<img src="/nonexistent.jpg">');

    const res2 = await this.get("/");
    const result2 = await res2.text();

    expect(result2).toEqual('<img src="/nonexistent.jpg">');
  });

  it("skips external hrefs and srcs", async function () {
    await this.write({ path: "/a.jpg", content: "image" });
    await this.write({ path: "/b.jpg", content: "image" });
    await this.template({
      "entries.html":
        '<img src="http://example.com/a.jpg"><a href="https://example.com/b.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toEqual(
      '<img src="http://example.com/a.jpg"><a href="https://example.com/b.jpg">'
    );
  });

  it("ignores path traversal attacks", async function () {
    await this.template({
      "entries.html": `<img src="../../../../a.jpg"><a href="../../../../etc/passwd">`,
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toEqual(
      '<img src="../../../../a.jpg"><a href="../../../../etc/passwd">'
    );
  });

  it("ignores empty hrefs and srcs", async function () {
    await this.template({
      "entries.html": '<img src=""><a href="">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toEqual('<img src=""><a href="">');
  });

  it("handles relative paths", async function () {
    await this.write({ path: "/a.jpg", content: "image" });
    await this.write({ path: "/b.jpg", content: "image" });
    await this.write({ path: "/c.jpg", content: "image" });
    await this.template({
      "entries.html":
        '<img src="./a.jpg"><img src="b.jpg"><img src="../c.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(cdnRegex("/a.jpg"));
    expect(result).toMatch(cdnRegex("/b.jpg"));
    expect(result).toMatch(cdnRegex("/c.jpg"));
  });

  it("should handle spaces and url-encoded chars", async function () {
    await this.write({ path: "/image with space.jpg", content: "image" });
    await this.template({
      "entries.html": '<img src="/image%20with%20space.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(cdnRegex("/image with space.jpg"));
  });

  it("should handle file names with percent signs", async function () {
    await this.write({ path: "/100% luck.jpg", content: "image" });
    await this.template({
      "entries.html": '<img src="/100% luck.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(cdnRegex("/100% luck.jpg"));
  });

  it("should handle query strings", async function () {
    await this.write({ path: "/image.jpg", content: "image" });
    await this.template({
      "entries.html": '<img src="/image.jpg?cache=false">',
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(cdnRegex("/image.jpg\\?cache=false"));
  });

  it("should use cached versions for repeated requests", async function () {
    await this.write({ path: "/cached.jpg", content: "image" });
    await this.template({
      "entries.html": '<img src="/cached.jpg">',
    });

    const filePath = this.blogDirectory + "/cached.jpg";

    const origStat = fs.stat;
    fs.stat = jasmine.createSpy("stat").and.callFake(origStat);

    // First request should trigger a stat
    const res1 = await this.get("/");
    const result1 = await res1.text();

    // Should have called stat once
    expect(fs.stat).toHaveBeenCalledWith(filePath);
    expect(fs.stat.calls.count()).toBe(1);

    // Reset the spy count
    fs.stat.calls.reset();

    // Second request should use cache
    const res2 = await this.get("/");
    const result2 = await res2.text();

    // Verify responses match
    expect(result1).toEqual(result2);

    // Verify stat was not called again
    expect(fs.stat).not.toHaveBeenCalled();

    // Restore original stat
    fs.stat = origStat;
  });

  it("should use cached versions for different query strings", async function () {
    await this.write({ path: "/cached.jpg", content: "image" });
    await this.template({
      "1.html": '<img src="/cached.jpg">',
      "2.html": '<img src="/cached.jpg?cache=false">',
    });

    const filePath = this.blogDirectory + "/cached.jpg";

    const origStat = fs.stat;
    fs.stat = jasmine.createSpy("stat").and.callFake(origStat);

    // First request should trigger a stat
    const res1 = await this.get("/1.html");
    const result1 = await res1.text();

    expect(result1).toMatch(cdnRegex("/cached.jpg"));
    // Should have called stat once
    expect(fs.stat).toHaveBeenCalledWith(filePath);
    expect(fs.stat.calls.count()).toBe(1);

    // Reset the spy count
    fs.stat.calls.reset();

    // Second request should use cache
    const res2 = await this.get("/2.html");
    const result2 = await res2.text();

    // Verify stat was not called again
    expect(fs.stat).not.toHaveBeenCalled();
    expect(result2).toMatch(cdnRegex("/cached.jpg\\?cache=false"));

    // Restore original stat
    fs.stat = origStat;
  });

  it("should handle multiple attributes in the same tag", async function () {
    await this.write({ path: "/test.jpg", content: "image" });
    await this.template({
      "entries.html": '<img src="/test.jpg" data-src="/test.jpg">',
    });

    const res = await this.get("/");
    const result = await res.text();

    const matches = result.match(
      new RegExp(`${config.cdn.origin}/folder/v-[a-f0-9]{8}`, "g")
    );
    expect(matches.length).toEqual(1); // Should only replace src, not data-src
  });

  it("should handle nested elements correctly", async function () {
    await this.write({ path: "/deep/nested/test.jpg", content: "image" });
    await this.template({
      "entries.html": `
                  <div>
                      <section>
                          <article>
                              <img src="/deep/nested/test.jpg">
                          </article>
                      </section>
                  </div>
              `.trim(),
    });

    const res = await this.get("/");
    const result = await res.text();

    expect(result).toMatch(
      new RegExp(`${config.cdn.origin}/folder/v-[a-f0-9]{8}`)
    );
    expect(result).toMatch(/\/deep\/nested\/test.jpg/);
  });

  it("should skip large base64 data URIs without locking up", async function () {
    // Generate a 2MB base64-encoded string
    const twoMB = 2 * 1024 * 1024; // 2MB in bytes
    const randomData = Buffer.alloc(twoMB, "A"); // Fill with 'A' characters
    const base64Data = randomData.toString("base64");
    const dataUri = `data:image/png;base64,${base64Data}`;

    await this.write({ path: "/test.html", content: `<img src="${dataUri}">` });
    await this.template({
      "entries.html": `{{#entries}}{{{html}}}{{/entries}}`,
    });

    const startTime = Date.now();
    const res = await this.get("/");
    const result = await res.text();
    const duration = Date.now() - startTime;

    // Should complete quickly (within 5 seconds) - if it tried to process the data URI,
    // it would lock up and take much longer
    expect(duration).toBeLessThan(5000);

    // Data URI should be left unchanged 
    expect(result).toContain(dataUri);
  });
});
