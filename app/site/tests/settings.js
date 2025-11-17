xdescribe("Blot dashboard settings", function () {

    const fs = require('fs-extra');

    require('./util/setup')({ login: true });
    
    it("lets you update the title of a site", async function () {
        const page = this.page;

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('a[href^="/sites/"]')
        ]);

        console.log('clicking on settings:', 'a[href="/sites/' + this.blog.handle + '/title"]');

        // click on the title setings link
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('a[href="/sites/' + this.blog.handle + '/title"]')
        ]);

        // enter a new title, selecting all the text first
        // before typing the new title
        const input = await page.$('input[name=title]');
        await input.click({ clickCount: 3 })
        await input.type('New title');
        
        console.log('saving new title');

        // submit the form
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('[type=submit]')
        ]);

        console.log('going back to the dashboard');

        // go back to the dashboard
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('a[href="/sites/' + this.blog.handle + '"]')
        ]);

        // the <title> of the page should be "New title - Blot"
        expect(await page.title()).toEqual('New title - Blot');
    });

    it("lets you sync the folder using local folder", async function () {

        const page = this.page;
       
        // go to the site overview page
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('a[href="/sites/' + this.blog.handle + '"]')
        ]);

        // go to the client settings page
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('a[href^="/sites/' + this.blog.handle + '/client"]')
        ]);

        // click on the button for the local folder client
        // name="client"
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('button[name=client][value=local]')
        ]);

        // go to the site overview page
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('a[href="/sites/' + this.blog.handle + '"]')
        ]);

        // verify the client link now says 'Local Folder'
        expect(await page.$eval('a[href^="/sites/' + this.blog.handle + '/client"] span.center', el => el.innerText.trim())).toEqual('Local folder');

        // add some files to the blog's folder
        const blogFolder = this.blogDirectory;

        console.log('writing a test file to the blog folder:', blogFolder + '/test.txt');

        await fs.outputFile(blogFolder + '/test.txt', 'test');

        console.log('going to the folder page');

        // go to the site overview page
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('a[href="/sites/' + this.blog.handle + '"]')
        ]);

        console.log('checking the folder page');

        // refresh the folder page
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'load' }),
            page.click('a[href="/sites/' + this.blog.handle + '"]')
        ]);

        // verify that the new file is listed in the folder
        expect(await page.$eval('table.directory-list', el => el.innerText.trim())).toContain('test.txt');

        console.log('syncing the folder');
    });
  });
  