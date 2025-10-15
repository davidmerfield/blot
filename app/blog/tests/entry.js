describe("entry", function () {

    require('./util/setup')();

    it("renders an entry", async function () {

        await this.write({path: '/a.txt', content: 'Link: a\nHello, A!'});

        const res = await this.get('/a', {redirect: 'manual'});
        const body = await res.text();

        expect(res.status).toEqual(200);
        expect(body).toContain('Hello, A!');
    });

    it("if you change an entry's url, the old one will redirect", async function () {

        await this.write({path: '/a.txt', content: 'Link: a\nHello, A!'});
        await this.write({path: '/a.txt', content: 'Link: b\nHello, A!'});

        const res = await this.get('/a', {redirect: 'manual'});
        const body = await res.text();

        expect(res.status).toEqual(302);
        expect(body).toContain('Redirecting to /b');

        // it won't redirect if the old URL is the index page (we don't want to clobber the index page)
        await this.write({path: '/index.txt', content: 'Link: /\nHello, A!'});

        const res2 = await this.get('/', {redirect: 'manual'});
        expect(res2.status).toEqual(200);
        expect(await res2.text()).toContain('Hello, A!');

        // change the index page
        await this.write({path: '/index.txt', content: 'Link: /c\nHello, A!'});


        const res3 = await this.get('/', {redirect: 'manual'});
        expect(res3.status).not.toEqual(302);
    });

    it("will not render a scheduled entry unless the query string scheduled is set to true", async function () {

        // 1 year from now
        const date = new Date();
        date.setFullYear(date.getFullYear() + 1);
        const dateString = date.toISOString();

        await this.write({path: '/a.txt', content: 'Link: a\nDate: ' + dateString + '\n\nHello, A!'});

        const res = await this.get('/a');

        expect(res.status).toEqual(404);

        const res2 = await this.get('/a?scheduled=true');
        const body = await res2.text();

        expect(res2.status).toEqual(200);
        expect(body).toContain('Hello, A!');
    });

    it("redirects to the source file for a post with ?source=true", async function () {

        await this.write({path: '/a.txt', content: 'Link: a\nHello, A!'});

        const res = await this.get('/a?source=true', {redirect: 'manual'});
        const body = await res.text();

        expect(res.status).toEqual(302);
        expect(res.headers.get('location')).toEqual('/a.txt');
        expect(body).toContain('Redirecting to /a.txt');
    });

    it("renders the entry against other urls", async function () {

        await this.write({path: '/a.txt', content: 'Link: a\nHello, A!'});

        const urls = [
            '/A', // case insensitive
            '/a/', // trailing slash
            '/A/', // case insensitive with trailing slash
        ];

        for (const url of urls) {
            const res = await this.get(url, {redirect: 'manual'});
            const body = await res.text();

            expect(res.status).toEqual(200);
            expect(body).toContain('Hello, A!');
        }
    });

});