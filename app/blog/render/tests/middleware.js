
describe("render middleware", function() {

  require('blog/tests/util/setup')();

  // it("should handle errors in retrieving the full view", function() {

  // });

  // it("should handle non-existing views", function() {

  // });

  it("sends json when the query string debug or json is present", async function() {

    await this.write({path: '/a.txt', content: 'Link: /foo\n\nHello, world!'});
    await this.template({
      'entry.html': `Entry`
    });

    const res = await this.get('/foo?json=true');
    const body = await res.json();

    expect(res.status).toEqual(200);
    console.log(body);
    // expect body to be a json object
    expect(body.entry.path).toEqual('/a.txt');
    expect(body.feedURL).toEqual('/feed.rss');
    expect(body.handle).toEqual(this.blog.handle);
    expect(body.cacheID).toEqual(jasmine.any(Number));
  });

});