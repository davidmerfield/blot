const renderFeatured = () => {
  const featured = document.getElementById("featured");

  if (!featured) return;

  const shuffleArray = (array) => array.sort(() => Math.random() - 0.5);

  const topOfListLength = 9;
  const totalSites = 16;

  const sites = featured.getElementsByTagName("li");
  const sitesArray = Array.prototype.slice.call(sites);
  const previousHrefs = JSON.parse(
    localStorage.getItem("previousHrefs") || "[]"
  );

  let topOfListCandidates = [...sitesArray];

  shuffleArray(topOfListCandidates);

  let maxFilterable = topOfListCandidates.length - topOfListLength;

  if (maxFilterable > 0) {
    // remove any sites that were in the previous top of list until we have enough
    topOfListCandidates = topOfListCandidates.filter(function (site) {
      const wouldLikeToKeep = !previousHrefs.includes(site.querySelector("a").href);

      if (wouldLikeToKeep) {
        return true;
      }

      if (!wouldLikeToKeep) {
        maxFilterable--;
      }

      return maxFilterable >= 0 && wouldLikeToKeep;
    });
  }

  shuffleArray(topOfListCandidates);

  const topOfList = topOfListCandidates.slice(0, topOfListLength);

  let remainder = [...sitesArray].filter(function (site) {
    return !topOfList.includes(site);
  });

  shuffleArray(remainder);

  // trim the number of sites
  remainder = remainder.slice(0, totalSites - topOfListLength);

  // save the results for the next pass
  const hrefs = topOfList.map((site) => site.querySelector("a").href);
  localStorage.setItem("previousHrefs", JSON.stringify(hrefs));

  featured.innerHTML = "";

  const result = [...topOfList, ...remainder];

  result.forEach(function (site) {
    featured.appendChild(site);
  });
};

renderFeatured();
