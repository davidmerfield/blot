xdescribe("Blot sign up", function () {
  require('./util/setup')();

  it("works", async function () {
    const page = this.page;

    // get any console errors
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
   
    // Listen for failed requests
    page.on('requestfailed', request => {
      console.log(`Failed to load: ${request.url()} - ${request.failure().errorText}`);
    });

    const card = {
      number: '4242424242424242',
      month: '12',
      year: '28',
      cvc: '123',
      zip: '12345'
    };

    await page.goto(this.origin + '/sites/sign-up');

    console.log('entering email');
    await page.type('input[name=email]', 'test@gmail.com');
    await page.keyboard.press("Tab");
    console.log('entering card');
    await page.keyboard.type(card.number, { delay: 50 })
    console.log('entering month');
    await page.keyboard.type(card.month, { delay: 50 })
    console.log('entering year');
    await page.keyboard.type(card.year, { delay: 50 })
    console.log('entering cvc');
    await page.keyboard.type(card.cvc, { delay: 50 })
    console.log('entering zip');
    await page.keyboard.type(card.zip, { delay: 50 })

    console.log('submitting payment form');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.click('[type=submit]'),
    ]);

    console.log('checking page url');
    expect(page.url()).toEqual(this.origin + '/sites/sign-up/create-account');

    // enter a password
    console.log('entering password');
    await page.type('input[name=password]', 'password');

    // submit the form
    console.log('submitting password form');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.click('[type=submit]'),
    ]);

    // wait for the create site page to load
    expect(page.url()).toEqual(this.origin + '/sites/account/create-site');

    // enter a title for the site
    console.log('entering site title');
    await page.type('input[name=title]', 'Test Site');

    console.log('submitting form to create site');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load' }),
      page.click('[type=submit]'),
    ]);

    // wait for the sites page to load
    expect(page.url()).toEqual(this.origin + '/sites/testsite/client');
  });
});
