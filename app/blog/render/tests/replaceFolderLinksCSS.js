describe("replaceCssUrls", function () {
    require("blog/tests/util/setup")();
  
    const config = require("config");
    const fs = require("fs-extra");
    const cdnRegex = (path) =>
      new RegExp(
        `${config.cdn.origin}/folder/v-[a-f0-9]{8}/blog_[a-f0-9]+${path}`
      );
  
    it("should replace url() with versioned CDN URLs", async function () {
      await this.write({ path: "/images/test.jpg", content: "fake image data" });
      await this.template({
        "style.css": `.test { background-image: url('/images/test.jpg'); }`,
      });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toMatch(
        new RegExp(
          `.test { background-image: url\\('${config.cdn.origin}/folder/v-[a-f0-9]{8}/[^']+/images/test.jpg'\\); }`
        )
      );
    });
  
    it("should handle unquoted URLs", async function () {
      await this.write({ path: "/images/test.jpg", content: "fake image data" });
      await this.template({
        "style.css": `.test { background: url(/images/test.jpg); }`,
      });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toMatch(cdnRegex("/images/test.jpg"));
    });
  
    it("should handle multiple URLs in the same rule", async function () {
      await this.write({ path: "/img1.jpg", content: "image1" });
      await this.write({ path: "/img2.jpg", content: "image2" });
      await this.template({
        "style.css": `
          .test { 
            background-image: url(/img1.jpg);
            border-image: url(/img2.jpg);
          }`,
      });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      const matches = result.match(
        new RegExp(`${config.cdn.origin}/folder/v-[a-f0-9]{8}`, "g")
      );
      expect(matches.length).toEqual(2);
    });
  
    it("should not modify external URLs", async function () {
      const css = `.test { 
        background: url(http://example.com/image.jpg);
        background-image: url(https://example.com/image.png);
      }`;
      await this.template({ "style.css": css });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toEqual(css);
    });
  
    it("should not modify data URLs", async function () {
      const css = `.test { 
        background: url(data:image/png;base64,abc123);
      }`;
      await this.template({ "style.css": css });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toEqual(css);
    });
  
    it("should handle missing files gracefully", async function () {
      const css = `.test { background: url(/nonexistent.jpg); }`;
      await this.template({ "style.css": css });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toEqual(css);
    });
  
    it("should preserve other CSS properties", async function () {
      await this.write({ path: "/test.jpg", content: "image" });
      await this.template({
        "style.css": `
          .test { 
            color: red; 
            background: url(/test.jpg) center/cover; 
            margin: 10px;
          }`,
      });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toMatch(/color: red;/);
      expect(result).toMatch(/center\/cover;/);
      expect(result).toMatch(/margin: 10px;/);
      expect(result).toMatch(cdnRegex("/test.jpg"));
    });
  
    it("should handle query strings", async function () {
      await this.write({ path: "/image.jpg", content: "image" });
      await this.template({
        "style.css": `.test { background: url('/image.jpg?v=1'); }`,
      });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toMatch(cdnRegex("/image.jpg\\?v=1"));
    });
  
    it("should use cached versions for repeated requests", async function () {
      await this.write({ path: "/cached.jpg", content: "image" });
      await this.template({
        "style.css": `.test { background: url(/cached.jpg); }`,
      });
  
      const filePath = this.blogDirectory + "/cached.jpg";
  
      const origStat = fs.stat;
      fs.stat = jasmine.createSpy("stat").and.callFake(origStat);
  
      // First request
      const res1 = await this.get("/style.css");
      const result1 = await res1.text();
  
      expect(fs.stat).toHaveBeenCalledWith(filePath);
      expect(fs.stat.calls.count()).toBe(1);
  
      fs.stat.calls.reset();
  
      // Second request
      const res2 = await this.get("/style.css");
      const result2 = await res2.text();
  
      expect(result1).toEqual(result2);
      expect(fs.stat).not.toHaveBeenCalled();
  
      fs.stat = origStat;
    });
  
    it("should handle multiple backgrounds with fallbacks", async function () {
      await this.write({ path: "/bg1.jpg", content: "image1" });
      await this.write({ path: "/bg2.jpg", content: "image2" });
      await this.template({
        "style.css": `
          .test { 
            background-image: url(/bg1.jpg), url(/bg2.jpg);
          }`,
      });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      const matches = result.match(
        new RegExp(`${config.cdn.origin}/folder/v-[a-f0-9]{8}`, "g")
      );
      expect(matches.length).toEqual(2);
    });
  
    it("ignores path traversal attempts", async function () {
      const css = `.test { 
        background: url(../../../../etc/passwd);
      }`;
      await this.template({ "style.css": css });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toEqual(css);
    });
  
    it("should handle relative paths", async function () {
      await this.write({ path: "/a.jpg", content: "image" });
      await this.write({ path: "/b.jpg", content: "image" });
      await this.template({
        "style.css": `
          .test { 
            background: url(./a.jpg);
            border-image: url(b.jpg);
          }`,
      });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toMatch(cdnRegex("/a.jpg"));
      expect(result).toMatch(cdnRegex("/b.jpg"));
    });
  
    it("should handle @media queries", async function () {
      await this.write({ path: "/mobile.jpg", content: "image" });
      await this.template({
        "style.css": `
          @media (max-width: 768px) {
            .test { background-image: url(/mobile.jpg); }
          }`,
      });
  
      const res = await this.get("/style.css");
      const result = await res.text();
  
      expect(result).toMatch(cdnRegex("/mobile.jpg"));
      expect(result).toMatch(/@media \(max-width: 768px\)/);
    });
  });