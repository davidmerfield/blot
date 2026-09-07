const localPath = require("helper/localPath");
const getBreadcrumbs = require("./breadcrumbs");
const getFile = require("./file");
const getFolder = require("./folder");
const Stat = require("./stat");
const clfdate = require("helper/clfdate");

async function middleware(req, res, next) {
  try {
    // Normalize the string to fix an encoding bug
    // "ブ".length => 1
    // "ブ".length => 2
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize

    const dir = req.params.path ? "/" + req.params.path.normalize('NFC') : '/';
    
    res.locals.folder = await loadFolder(req.blog, dir);

    for (const breadcrumb of res.locals.folder.breadcrumbs) {
      res.locals.breadcrumbs.add(breadcrumb.name, breadcrumb.url);
    }

    if (req.params.path) {
      
      if (res.locals.folder.directory) {
        res.render("dashboard/folder/directory");
      } else {
        res.render("dashboard/folder/file");
      }

    } else {
      next();
    }

  } catch (err) {

    if (err && err.code === 'ENOENT' && req.params.path) {
      res.locals.folder = {directory: true, contents: []};
      res.render("dashboard/folder");
    } else {
      console.log("HERE", err);
      next(err);
    }

  }
}

// Cache the root directory folder data for 100 folders
// unless the blog is currenltly in the process of syncing
const folderCache = {};

const invalidateCache = (blog) => {
  const prefix = `${blog.id}_${blog.cacheID}_`;

  for (const key of Object.keys(folderCache)) {
    if (key.startsWith(prefix)) {
      delete folderCache[key];
    }
  }
};

const loadFolder = async (blog, dir) => {

  const cacheKey = blog.id + '_' + blog.cacheID + '_' + dir;
  const synced = blog.status.message.toLowerCase() === 'synced';
  
  if (synced && folderCache[cacheKey]) {
    // console.log(clfdate(), 'folder cache HIT', cacheKey);
    return folderCache[cacheKey];
  } else {
    // console.log(clfdate(), 'folder cache MISS', cacheKey);
  }

  if (Object.keys(folderCache).length >= 100) {
    const oldestCacheKey = Object.keys(folderCache)[0];
    delete folderCache[oldestCacheKey];
  }

  const local = localPath(blog.id, dir);
  const stat = await Stat(local, blog.timeZone);

  const folder = {
    root: dir === '/',
    directory: stat.directory,
    file: stat.file,
    stat,
  };

  if (stat.file) {
    const [breadcrumbs, fileStat] = await Promise.all([
      getBreadcrumbs(blog.id, dir, blog.cacheID),
      getFile(blog, dir)
    ]);

    folder.breadcrumbs = breadcrumbs;
    folder.stat = { ...folder.stat, ...fileStat };

  } else if (stat.directory) {
    const [breadcrumbs, contents] = await Promise.all([
      getBreadcrumbs(blog.id, dir, blog.cacheID),
      getFolder(blog, dir)
    ]);

    folder.contents = contents;
    folder.breadcrumbs = breadcrumbs;
  }

  if (dir === '/') {
    folderCache[cacheKey] = folder;
  }

  // console.log('folder cache is', JSON.stringify(folderCache, null, 2));

  return folder;
}


middleware.invalidateCache = invalidateCache;

module.exports = middleware;
