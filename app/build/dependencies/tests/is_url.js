describe("is_url", function () {
  var is_url = require("../is_url");

  function should_be_url(string) {
    it("detects a URL in " + string, function () {
      expect(is_url(string)).toEqual(true);
    });
  }

  function should_not_be_url(string) {
    it("does not detect a URL in " + string, function () {
      expect(is_url(string)).toEqual(false);
    });
  }

  should_be_url("http://example.org");
  should_be_url("//example.org");
  should_be_url("https://example.org");
  should_be_url("https://ww.example.org.123");
  should_be_url("https://example.org/apple/pie");
  should_be_url("mailto:user@example.com");
  should_be_url("tel:+15551234567");
  should_be_url("sms:+15551234567");

  should_not_be_url();
  should_not_be_url({ a: 1, b: 2 });
  should_not_be_url(null);
  should_not_be_url("");
  should_not_be_url(false);
  should_not_be_url("example.com");
  should_not_be_url("example");
  should_not_be_url("/bar/foo.jpg");
  should_not_be_url("!!!!!");
  should_not_be_url("fsdhjkfgsdhjf");
});
