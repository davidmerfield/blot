describe("hypertext loadAllPages pagination tokens", function () {
  function collectTokens(initialMarkers, pages) {
    const seen = new Set();
    const fetched = [];
    let markers = initialMarkers.slice();
    let guard = 0;
    const maxPages = 100;

    while (true) {
      if (++guard > maxPages) break;
      if (!markers.length) break;

      const token = markers.shift();
      if (!token) continue;

      markers = markers.filter((t) => t !== token);

      if (seen.has(token)) continue;
      seen.add(token);

      fetched.push(token);
      const nextPage = pages[token];
      if (nextPage && nextPage.markers) {
        markers = markers.concat(nextPage.markers);
      }
    }

    return fetched;
  }

  it("does not re-fetch the same page when duplicate markers are present", function () {
    const fetched = collectTokens(["2", "2", "2"], {
      2: { markers: ["3", "3"] },
      3: { markers: [] },
    });

    expect(fetched).toEqual(["2", "3"]);
  });

  it("stops when there is no next page", function () {
    const fetched = collectTokens(["2"], {
      2: { markers: [] },
    });

    expect(fetched).toEqual(["2"]);
  });
});

describe("hypertext PageTransitioner URL helpers", function () {
  function parsePageUrl(url, base) {
    const parsed = new URL(url, base);
    const hash = parsed.hash;
    const displayUrl = parsed.href;
    const cacheUrl = new URL(parsed.href);
    cacheUrl.hash = "";
    const fetchUrl = new URL(parsed.href);
    fetchUrl.hash = "";
    fetchUrl.searchParams.set("partial", "true");
    return {
      hash,
      displayUrl,
      cacheKey: cacheUrl.href,
      fetchUrl: fetchUrl.href,
    };
  }

  const base = "https://example.com/notes/intro";

  it("adds partial=true as a query param before the hash", function () {
    const { fetchUrl, hash } = parsePageUrl("/other#section", base);
    const parsed = new URL(fetchUrl);

    expect(parsed.searchParams.get("partial")).toEqual("true");
    expect(parsed.hash).toEqual("");
    expect(fetchUrl.indexOf("#")).toEqual(-1);
    expect(hash).toEqual("#section");
  });

  it("does not append ?partial=true after the fragment", function () {
    const { fetchUrl } = parsePageUrl("https://example.com/page#hash", base);
    expect(fetchUrl).not.toContain("#hash?partial=true");
    expect(fetchUrl).toContain("?partial=true");
  });
});
