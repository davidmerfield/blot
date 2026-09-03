const { assertPublicUrl } = require("helper/publicUrl");

// Chrome does its own DNS resolution and redirect following, so a pre-flight
// check on the target URL alone can be bypassed by a redirect or a subresource
// request. Intercept every request the page makes and drop anything that isn't
// an http(s) URL resolving to a public address — this blocks file://, private
// ranges and the cloud metadata endpoint. data:/blob: carry no network request
// and are left alone.
module.exports = async (page) => {
  await page.setRequestInterception(true);

  page.on("request", (request) => {
    const url = request.url();

    if (url.startsWith("data:") || url.startsWith("blob:"))
      return request.continue().catch(() => {});

    assertPublicUrl(url).then(
      () => request.continue().catch(() => {}),
      () => request.abort("blockedbyclient").catch(() => {})
    );
  });
};
