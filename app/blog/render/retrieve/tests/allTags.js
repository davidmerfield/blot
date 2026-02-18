describe("all tags", function () {

  require('blog/tests/util/setup')();

  it("lists all tags", async function () {
      
      await this.write({path: '/a.txt', content: 'Tags: abc\n\nFoo'});
      await this.write({path: '/b.txt', content: 'Tags: abc\n\nBar'});
      await this.write({path: '/c.txt', content: 'Tags: def\n\nBaz'});
      await this.write({path: '/d.txt', content: 'Tags: def\n\nQux'});
      await this.write({path: '/e.txt', content: 'Tags: def\n\nQuux'});

      await this.template({
          'entries.html': `<ul>{{#all_tags}}<li>{{tag}}</li>{{/all_tags}}</ul>`
      });

      const res = await this.get('/');
      const body = await res.text();

      expect(res.status).toEqual(200);
      expect(body.trim()).toEqual('<ul><li>abc</li><li>def</li></ul>');
  });

  it("lists all tags with many posts", async function () {
      const tags = Array.from({ length: 100 }, (_, i) => `tag${i}`);
      const tagUsage = {};
  
      for (let i = 0; i < 200; i++) {
          const numTags = (i % 5) + 1; // Deterministically assign the number of tags
          const postTags = i % 2 ? tags.slice(0, numTags) : tags.slice(-numTags);
          for (const tag of postTags) {
              tagUsage[tag] = (tagUsage[tag] || 0) + 1;
          }
          await this.blog.write({ path: `/post${i}.txt`, content: `Tags: ${postTags.join(', ')}\n\nContent ${i}` });
      }
  
      await this.blog.rebuild();
  
      await this.template({
          'entries.html': `<ul>{{#all_tags}}<li>{{tag}} {{entries.length}}</li>{{/all_tags}}</ul>`
      });
  
      const res = await this.get('/');
      const body = await res.text();
  
      expect(res.status).toEqual(200);
      expect(body.trim()).toEqual('<ul><li>tag0 100</li><li>tag1 80</li><li>tag2 60</li><li>tag3 40</li><li>tag4 20</li><li>tag95 20</li><li>tag96 40</li><li>tag97 60</li><li>tag98 80</li><li>tag99 100</li></ul>');
  }, 30000);

  it("encodes slugs in all_tags output", async function () {
      await this.write({path: '/a.txt', content: 'Tags: Design/UI\n\nFoo'});

      await this.template({
          'entries.html': `{{#all_tags}}{{slug}}{{/all_tags}}`
      });

      const res = await this.get('/');
      const body = await res.text();

      expect(res.status).toEqual(200);
      expect(body.trim()).toEqual('design%2Fui');
  });

});