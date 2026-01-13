describe("vimeo embeds", function () {
  const vimeo = require("../vimeo");
  const nock = require("nock");

  beforeEach(function () {
    nock.disableNetConnect();

    nock("https://vimeo.com")
      .get("/api/oembed.json")
      .query(true)
      .reply(function (uri) {
        const requestUrl = new URL(`https://vimeo.com${uri}`).searchParams.get(
          "url"
        );

        if (requestUrl && requestUrl.startsWith("https://vimeo.com/87952436")) {
          return [
            200,
            {
              video_id: 87952436,
              width: 16,
              height: 9,
              thumbnail_url:
                "https://i.vimeocdn.com/video/466717816-33ad450eea4c71be9149dbe2e0d18673874917cadd5f1af29de3731e4d22a77f-d_295x166?region=us",
            },
          ];
        }

        return [404, {}];
      });
  });

  afterEach(function () {
    nock.cleanAll();
    nock.enableNetConnect();
  });
  it("handles an empty href", function (done) {
    const href = "";
    vimeo(href, (err, template) => {
      expect(err.message).toEqual("Could not retrieve video properties");
      expect(template).toEqual(undefined);
      done();
    });
  });

  it("handles an invalid href", function (done) {
    const href = "https://vimeo.com/^*%&^*(";
    vimeo(href, (err, template) => {
      expect(err.message).toEqual("Could not retrieve video properties");
      expect(template).toEqual(undefined);
      done();
    });
  });

  it("handles an invalid host", function (done) {
    const href = "https://viimeo.com/123";
    vimeo(href, (err, template) => {
      expect(err.message).toEqual("Could not retrieve video properties");
      expect(template).toEqual(undefined);
      done();
    });
  });

  it("handles an invalid path", function (done) {
    const href = "https://vimeo.com/invalid";
    vimeo(href, (err, template) => {
      expect(err.message).toEqual("Could not retrieve video properties");
      expect(template).toEqual(undefined);
      done();
    });
  });

  it("handles a valid link", function (done) {
    const href = "https://vimeo.com/87952436";
    vimeo(href, (err, template) => {
      expect(err).toEqual(null);
      expect(template).toEqual(
        `<div style="width:0;height:0"> </div><div class="videoContainer vimeo" style="padding-bottom: 56.25%" ><iframe data-thumbnail="https://i.vimeocdn.com/video/466717816-33ad450eea4c71be9149dbe2e0d18673874917cadd5f1af29de3731e4d22a77f-d.jpg" src="//player.vimeo.com/video/87952436?badge=0&color=ffffff&byline=0&portrait=0" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`
      );
      done();
    });
  });

  it("handles a valid link with a trailing slash", function (done) {
    const href = "https://vimeo.com/87952436/";
    vimeo(href, (err, template) => {
      expect(err).toEqual(null);
      expect(template).toEqual(
        `<div style="width:0;height:0"> </div><div class="videoContainer vimeo" style="padding-bottom: 56.25%" ><iframe data-thumbnail="https://i.vimeocdn.com/video/466717816-33ad450eea4c71be9149dbe2e0d18673874917cadd5f1af29de3731e4d22a77f-d.jpg" src="//player.vimeo.com/video/87952436?badge=0&color=ffffff&byline=0&portrait=0" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`
      );
      done();
    });
  });

  it("handles a valid link with a query string", function (done) {
    const href = "https://vimeo.com/87952436?query=string";
    vimeo(href, (err, template) => {
      expect(err).toEqual(null);
      expect(template).toEqual(
        `<div style="width:0;height:0"> </div><div class="videoContainer vimeo" style="padding-bottom: 56.25%" ><iframe data-thumbnail="https://i.vimeocdn.com/video/466717816-33ad450eea4c71be9149dbe2e0d18673874917cadd5f1af29de3731e4d22a77f-d.jpg" src="//player.vimeo.com/video/87952436?badge=0&color=ffffff&byline=0&portrait=0" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`
      );
      done();
    });
  });

  it("handles a valid link with a hash", function (done) {
    const href = "https://vimeo.com/87952436#hash";
    vimeo(href, (err, template) => {
      expect(err).toEqual(null);
      expect(template).toEqual(
        `<div style="width:0;height:0"> </div><div class="videoContainer vimeo" style="padding-bottom: 56.25%" ><iframe data-thumbnail="https://i.vimeocdn.com/video/466717816-33ad450eea4c71be9149dbe2e0d18673874917cadd5f1af29de3731e4d22a77f-d.jpg" src="//player.vimeo.com/video/87952436?badge=0&color=ffffff&byline=0&portrait=0" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe></div>`
      );
      done();
    });
  });
});
