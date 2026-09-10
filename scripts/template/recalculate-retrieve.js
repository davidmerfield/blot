var eachBlog = require("../each/blog");
var progress = require("../each/progress");
var async = require("async");
var Template = require("models/template");
var templateKey = require("models/template/key");
var redis = require("models/client");
var Blog = require("models/blog");
var parseTemplate = require("models/template/parseTemplate");
var applyUserRetrieveOptions = require("models/template/util/applyUserRetrieveOptions");
var updateCdnManifest = require("models/template/util/updateCdnManifest");

// How many blogs to process concurrently. 1 keeps the nested progress line
// accurate; raise it (via --concurrency=N) when the per-blog Redis reads are
// the bottleneck on a full-fleet run.
var DEFAULT_CONCURRENCY = 1;

if (require.main === module) {
  var options = parseArgs(process.argv.slice(2));

  main(options, function (err, stats) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(
      options.dryRun ? "Dry run complete." : "Done.",
      options.dryRun ? "Would recalculate" : "Recalculated",
      "retrieve metadata for",
      stats.updated,
      "views",
      "(skipped",
      stats.skipped,
      "invalid,",
      stats.alreadyMigrated,
      "already current)"
    );

    process.exit(0);
  });
}

function parseArgs(argv) {
  var options = { dryRun: false, concurrency: DEFAULT_CONCURRENCY };

  (argv || []).forEach(function (arg) {
    if (arg === "--dry-run" || arg === "-n") {
      options.dryRun = true;
    } else if (arg.indexOf("--concurrency=") === 0) {
      var n = parseInt(arg.slice("--concurrency=".length), 10);
      if (n > 0) options.concurrency = n;
    }
  });

  return options;
}

function main(options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  options = options || {};

  var dryRun = options.dryRun === true;
  var concurrency = options.concurrency > 0 ? options.concurrency : DEFAULT_CONCURRENCY;

  var stats = {
    updated: 0,
    skipped: 0,
    alreadyMigrated: 0,
  };

  // Blog-owned templates. Recalculate every view of every template, then, once
  // per blog whose templates actually changed, bump that blog's cacheID a
  // single time and rebuild the CDN manifest of each changed template.
  //
  // recalcView reparses each view in-process and only writes (just the
  // `retrieve` hash field) when the stored metadata differs from what the
  // parser now produces - so a view that is already current costs one parse
  // and no Redis write, and a blog with nothing stale is never flushed.
  eachBlog(
    function (user, blog, nextBlog) {
      recalcBlog(blog.id, stats, dryRun, nextBlog);
    },
    function (err) {
      if (err) return callback(err, stats);

      // Bundled SITE:* templates are used directly by blogs but are skipped
      // by scripts/each - iterate them explicitly so their views also pick
      // up field projection metadata.
      var touchedSiteTemplates = {};

      eachSiteView(
        function (templateID, view, next) {
          recalcView(templateID, view, stats, dryRun, function (err, changed) {
            if (changed) touchedSiteTemplates[templateID] = true;
            next(err);
          });
        },
        function (err) {
          // setView's cacheID bump is deferred for these, and their owner is
          // the synthetic "SITE" anyway. Flush the full-view / rendered-output
          // caches of every blog whose active template we just rewrote so the
          // new retrieve metadata takes effect - even if iteration stopped on
          // an error, so a partial run still flushes what it did rewrite.
          if (dryRun) return callback(err, stats);

          invalidateBlogsUsing(
            Object.keys(touchedSiteTemplates),
            function (flushErr) {
              callback(err || flushErr, stats);
            }
          );
        }
      );
    },
    { c: concurrency }
  );
}

function recalcBlog(blogID, stats, dryRun, done) {
  Template.getTemplateList(blogID, function (err, templates) {
    if (err) return done(err);

    var owned = (templates || []).filter(function (template) {
      return template.owner === blogID;
    });

    var changedTemplateIDs = [];
    var bar = progress.push("Template", owned.length);

    async.eachSeries(
      owned,
      function (template, nextTemplate) {
        recalcTemplateViews(template.id, stats, dryRun, function (err, changed) {
          if (changed) changedTemplateIDs.push(template.id);
          bar.tick();
          // Stop the blog loop on a genuine write error, but keep the partial
          // `changed` set so finalizeBlog still flushes the views that were
          // rewritten before the failure.
          nextTemplate(err);
        });
      },
      function (err) {
        bar.pop();

        if (dryRun) return done(err);

        finalizeBlog(blogID, changedTemplateIDs, function (flushErr) {
          done(err || flushErr);
        });
      }
    );
  });
}

function recalcTemplateViews(templateID, stats, dryRun, done) {
  Template.getAllViews(templateID, function (err, views) {
    if (err) return done(err, false);

    var changed = false;
    var firstErr = null;
    var bar = progress.push("View", Object.keys(views || {}).length);

    async.eachOfSeries(
      views || {},
      function (view, name, nextView) {
        recalcView(templateID, view, stats, dryRun, function (err, viewChanged) {
          if (viewChanged) changed = true;
          if (err && !firstErr) firstErr = err;
          bar.tick();
          nextView(err);
        });
      },
      function (err) {
        bar.pop();
        done(firstErr || err || null, changed);
      }
    );
  });
}

// Flush a blog's caches after its templates were recalculated. One cacheID
// bump invalidates every full-view / rendered cache entry for the blog -
// app/blog/render/full-view-cache.js keys on blog.cacheID, so this covers the
// active template and every preview-of-my-* template alike. Bump before
// rebuilding any manifest so updateCdnManifest renders CDN targets against the
// new cacheID, matching the order setView and clone use.
function finalizeBlog(blogID, changedTemplateIDs, done) {
  if (!changedTemplateIDs.length) return done();

  // Re-read the blog: this script is long-running and the owner may have
  // switched active template while we worked through their other templates.
  Blog.get({ id: blogID }, function (err, blog) {
    if (err) return done(err);
    if (!blog) return done();

    Blog.set(blogID, { cacheID: Date.now() }, function (err) {
      if (err) return done(err);

      console.log("Flushed cache for", blog.handle || blogID);

      // Rebuild the CDN manifest once per changed template. updateCdnManifest
      // no-ops for templates that aren't installed on their owner blog, so an
      // inactive template costs only a metadata lookup here.
      async.eachSeries(
        changedTemplateIDs,
        function (templateID, next) {
          updateCdnManifest(templateID, next);
        },
        done
      );
    });
  });
}

function recalcView(templateID, view, stats, dryRun, next) {
  if (!view || !view.name || !view.content) {
    stats.skipped++;
    return next(null, false);
  }

  var expectedRetrieve;

  try {
    var parsed = parseTemplate(view.content);
    // setView persists exactly applyUserRetrieveOptions(parser output, the
    // update's retrieve, the stored retrieve). The recalculation passes no
    // real retrieve options, so a full setView run would store precisely
    // this. Compute it here without any Redis round-trip.
    expectedRetrieve = applyUserRetrieveOptions(
      parsed.retrieve || {},
      undefined,
      view.retrieve || {}
    );
  } catch (e) {
    // The parser choked on this view's content. Leave it untouched rather
    // than guessing - a genuinely broken view is a pre-existing problem and
    // rewriting its metadata blind could make things worse.
    console.error(
      "Skipping unparseable view",
      templateID,
      view.name,
      "-",
      e && e.message
    );
    stats.skipped++;
    return next(null, false);
  }

  // Idempotent: the stored retrieve already matches the parser. No write, and
  // - because this view reports no change - no cache flush for its blog.
  if (
    stableStringify(expectedRetrieve) === stableStringify(view.retrieve || {})
  ) {
    stats.alreadyMigrated++;
    return next(null, false);
  }

  if (dryRun) {
    stats.updated++;
    console.log("Would update", templateID, view.name);
    return next(null, true);
  }

  // Only the parser-derived retrieve metadata is changing. Write just that
  // one hash field: no content validation, no infinite-partial detection, no
  // rewrite of the (potentially megabyte) content field, no per-view cacheID
  // bump. finalizeBlog / invalidateBlogsUsing flush the owner blog once.
  redis
    .hSet(
      templateKey.view(templateID, view.name),
      "retrieve",
      JSON.stringify(expectedRetrieve)
    )
    .then(function () {
      stats.updated++;
      console.log("Updated", templateID, view.name);
      next(null, true);
    })
    .catch(function (err) {
      // Report the view as changed so the caller still flushes this
      // template's caches before the error stops the run.
      next(err, true);
    });
}

// Deterministic JSON: object keys sorted at every level so two structurally
// equal retrieve objects (parsed fresh vs. round-tripped through Redis)
// stringify identically. Array order is left alone - it is meaningful for
// `cdn`, which applyUserRetrieveOptions already sorts.
function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce(function (acc, key) {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }

  return value;
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
      var templateBar = progress.push("Template", (templateIDs || []).length);

      async.eachSeries(
        templateIDs || [],
        function (templateID, nextItem) {
          var nextTemplate = function (err) {
            templateBar.tick();
            nextItem(err);
          };

          Template.getAllViews(templateID, function (err, views) {
            if (err) return nextTemplate(err);

            var viewBar = progress.push(
              "View",
              Object.keys(views || {}).length
            );

            async.eachOfSeries(
              views || {},
              function (view, name, nextView) {
                iterator(templateID, view, function (err) {
                  viewBar.tick();
                  nextView(err);
                });
              },
              function (err) {
                viewBar.pop();
                nextTemplate(err);
              }
            );
          });
        },
        function (err) {
          templateBar.pop();
          done(err);
        }
      );
    })
    .catch(done);
}

module.exports = main;
