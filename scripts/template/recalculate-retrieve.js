var eachTemplate = require("../each/template");
var async = require("async");
var Template = require("models/template");
var templateKey = require("models/template/key");
var redis = require("models/client");
var Blog = require("models/blog");
var updateCdnManifest = require("models/template/util/updateCdnManifest");

if (require.main === module) {
  main(function (err, stats) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(
      "Done. Recalculated retrieve metadata for",
      stats.updated,
      "views",
      "(skipped",
      stats.skipped + ")"
    );

    process.exit(0);
  });
}

function main(callback) {
  var stats = {
    updated: 0,
    skipped: 0,
  };

  // Blog-owned templates. Recalculate every view of every template with the
  // per-view cache work deferred (see recalcView), then, once per template,
  // refresh the CDN manifest and - only when this template is the one the
  // blog actually renders - bump the blog's cacheID a single time.
  //
  // setView would otherwise bump the owner blog's cacheID and rebuild the
  // CDN manifest once per changed view, for every template the blog owns
  // including inactive ones, needlessly flushing the whole fleet's rendered
  // cache many times over.
  eachTemplate(
    function (user, blog, template, nextTemplate) {
      recalcTemplate(blog, template.id, stats, nextTemplate);
    },
    function (err) {
      if (err) return callback(err, stats);

      // Bundled SITE:* templates are used directly by blogs but are skipped
      // by scripts/each - iterate them explicitly so their views also pick
      // up field projection metadata.
      var touchedSiteTemplates = {};

      eachSiteView(
        function (templateID, view, next) {
          recalcView(templateID, view, stats, function (err, changed) {
            if (!err && changed) touchedSiteTemplates[templateID] = true;
            next(err);
          });
        },
        function (err) {
          if (err) return callback(err, stats);

          // setView's cacheID bump is deferred for these too, and its owner
          // is the synthetic "SITE" anyway. Flush the full-view and
          // rendered-output caches of every blog whose active template we
          // just rewrote so the new retrieve metadata takes effect.
          invalidateBlogsUsing(Object.keys(touchedSiteTemplates), function (err) {
            callback(err, stats);
          });
        }
      );
    }
  );
}

function recalcTemplate(blog, templateID, stats, done) {
  Template.getAllViews(templateID, function (err, views) {
    if (err) return done(err);

    var changed = false;

    async.eachOfSeries(
      views || {},
      function (view, name, nextView) {
        recalcView(templateID, view, stats, function (err, viewChanged) {
          if (!err && viewChanged) changed = true;
          nextView(err);
        });
      },
      function (err) {
        if (err) return done(err);

        // Nothing was rewritten - no cache to flush.
        if (!changed) return done();

        // Refresh the CDN manifest once for the whole template.
        // updateCdnManifest already no-ops when the template isn't installed
        // on its owner blog, so this is cheap for inactive templates.
        updateCdnManifest(templateID, function (err) {
          if (err) return done(err);

          // Only the blog's active template affects what it renders, so only
          // that one needs a cache flush.
          if (!blog || !blog.template || blog.template !== templateID)
            return done();

          Blog.set(blog.id, { cacheID: Date.now() }, function (err) {
            if (!err) console.log("Flushed cache for", blog.handle || blog.id);
            done(err);
          });
        });
      }
    );
  });
}

function recalcView(templateID, view, stats, next) {
  if (!view || !view.name || !view.content) {
    stats.skipped++;
    return next(null, false);
  }

  // Force setView to re-parse template content and rewrite retrieve
  // metadata. setView short-circuits when content and retrieve are
  // unchanged, so pass a sentinel retrieve object. setView drops the
  // sentinel and rebuilds retrieve from the parser, preserving user
  // options such as includeDraft and filters.
  //
  // deferCacheBump: skip setView's per-view cacheID bump and CDN manifest
  // rebuild - the caller does that once per template instead.
  Template.setView(
    templateID,
    {
      name: view.name,
      content: view.content,
      retrieve: {
        __recalculateRetrieve: Date.now(),
      },
    },
    { deferCacheBump: true },
    function (err) {
      if (err) return next(err);

      stats.updated++;
      console.log("Updated", templateID, view.name);
      next(null, true);
    }
  );
}

// Mirror app/templates/index.js:emptyCacheForBlogsUsing - bump the cacheID of
// every blog whose active template is one we just rewrote. Used for SITE:*
// templates, whose owner is the literal "SITE" so no real blog's cacheID is
// touched by the recalculation itself.
function invalidateBlogsUsing(templateIDs, done) {
  if (!templateIDs || !templateIDs.length) return done();

  var touched = {};
  templateIDs.forEach(function (id) {
    touched[id] = true;
  });

  Blog.getAllIDs(function (err, ids) {
    if (err) return done(err);

    async.eachSeries(
      ids || [],
      function (blogID, next) {
        Blog.get({ id: blogID }, function (err, blog) {
          if (err) return next(err);
          if (!blog || !blog.template || !touched[blog.template]) return next();

          Blog.set(blogID, { cacheID: Date.now() }, function (err) {
            if (err) return next(err);
            console.log("Flushed cache for", blog.handle || blogID);
            next();
          });
        });
      },
      done
    );
  });
}

function eachSiteView(iterator, done) {
  redis
    .sMembers(templateKey.blogTemplates("SITE"))
    .then(function (templateIDs) {
      async.eachSeries(
        templateIDs || [],
        function (templateID, nextTemplate) {
          Template.getAllViews(templateID, function (err, views) {
            if (err) return nextTemplate(err);

            async.eachOfSeries(
              views || {},
              function (view, name, nextView) {
                iterator(templateID, view, nextView);
              },
              nextTemplate
            );
          });
        },
        done
      );
    })
    .catch(done);
}

module.exports = main;
