const Metadata = require("models/metadata");

const cache = {};

async function getBreadcrumbs(blogId, dir, cacheID) {
  if (dir === "/") {
    return [];
  }

  const names = dir.split("/").filter(Boolean);
  const breadcrumbs = [];
  const paths = names.map((name, index) => "/" + names.slice(0, index + 1).join("/"));

  try {
    const casePreservedNames = await getCasePreservedNames(blogId, paths, cacheID);

    for (let i = 0; i < names.length; i++) {
      breadcrumbs.push({ 
        name: casePreservedNames[i] || names[i],
        url: i === 0 ? "/folder/" + names[i] : names[i]
      });
    }
  } catch (err) {
    throw err;
  }

  // console.log('breadcrumb cache is', cache);
  
  return breadcrumbs;
}

async function getCasePreservedNames(blogId, paths, cacheID) {
  const cachePrefix = blogId.slice(5,17) + cacheID;
  const unknownPaths = paths.filter(path => cache[cachePrefix + path] === undefined);

  if (unknownPaths.length === 0) {
    return paths.map(path => cache[cachePrefix + path]);
  }

  try {
    const unknownCasePreservedNames = await new Promise((resolve, reject) => {
      Metadata.get(blogId, unknownPaths, function (err, unknownCasePreservedNames) {
        if (err) {
          reject(err);
        } else {
          resolve(unknownCasePreservedNames);
        }
      });
    });

    const casePreservedNames = paths.map(path => {
      return cache[cachePrefix + path] || unknownCasePreservedNames[unknownPaths.indexOf(path)];
    });

    unknownPaths.forEach((path, index) => {
      cache[cachePrefix + path] = unknownCasePreservedNames[index] || null;
    });


    return casePreservedNames;
  } catch (err) {
    throw err;
  }
}

module.exports = getBreadcrumbs;
