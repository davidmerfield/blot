describe("augment", function () {

    require('../../tests/util/setup')();

    it("adds formatDate function to entries", async function () {
        
        await this.write({path: "/first.txt", content: "Foo"});
        await this.template({
            'entry.html': '{{#entry}}{{#formatDate}}YYYY{{/formatDate}}{{/entry}}'
        }, { locals: { name: 'David' } });

        const res = await this.get('/first');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual(new Date().getFullYear().toString());
    });
    
    it("adds ratio property to thumbnails", async function () {
    
        const image = await require('sharp')({
            create: {
                width: 100,
                height: 200,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        }).png().toBuffer();

        await this.write({path: "/_thumbnail.jpg", content: image});
        await this.write({path: "/first.txt", content: "![](_thumbnail.jpg)"});
        await this.template({'entry.html': '{{entry.thumbnail.large.ratio}}'});

        const res = await this.get('/first');
        const body = await res.text();

        expect(res.status).toEqual(200);
        // this is used to apply a padding-bottom to the thumbnail container to maintain aspect ratio
        expect(body.trim()).toEqual('200%');
    });

    it("renders entry backlinks", async function () {
        
        await this.write({path: "/first.txt", content: "Foo"});
        await this.write({path: "/second.txt", content: "Title: Second\n\n[[first]]"});
        await this.template({
            'entry.html': '{{#entry}}{{#backlinks}}{{title}}{{/backlinks}}{{/entry}}'
        });

        const res = await this.get('/first');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('Second');
    });

    it("encodes tag slugs when augmenting entry tags", async function () {

        await this.write({
            path: "/slash-tag.txt",
            content: "Title: Slash Tag\nTags: Design/UI\n\nBody"
        });

        await this.template({
            'entry.html': '{{#entry.tags}}{{slug}}{{/entry.tags}}'
        });

        const res = await this.get('/slash-tag');
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body.trim()).toEqual('design%2Fui');
    });
});
