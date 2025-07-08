// WRITE TESTS FIRST

var config = require("config");
var Template = require("models/template");
var capitalize = require("helper/capitalize");
var extend = require("helper/extend");
var basename = require("path").basename;
var debug = require("debug")("blot:templates");
var Mustache = require("mustache");
var fs = require("fs-extra");
var async = require("async");
var Blog = require("models/blog");
var _ = require("lodash");
var chokidar = require("chokidar");
var TEMPLATES_DIRECTORY = require("path").resolve(__dirname + "/latest");
var PAST_TEMPLATES_DIRECTORY = require("path").resolve(__dirname + "/past");
var TEMPLATES_OWNER = "SITE";

const redis = require("models/redis");

var HIGHLIGHTER_THEMES = require("blog/static/syntax-highlighter");

const fonts = require("blog/static/fonts");

var DEFAULT_FONT = fonts
  .filter((font) => font.name === "System sans-serif")
  .map((font) => {
    font.styles = Mustache.render(font.styles, {
      config: {
        cdn: { origin: config.cdn.origin },
      },
    });
    return font;
  })[0];

var DEFAULT_MONO_FONT = fonts
  .filter((font) => font.name === "System mono")
  .map((font) => {
    font.styles = Mustache.render(font.styles, {
      config: {
        cdn: { origin: config.cdn.origin },
      },
    });
    return font;
  })[0];

if (require.main === module) {
  // if this script is run directly in the terminal
  // in the development environment without the flag
  // --no-watch, we want to watch the templates directory for changes
  // and rebuild the templates when they change.
  let watch =
    config.environment === "development" &&
    !process.argv.includes("--no-watch");

  console.log("Building templates... watch=" + watch);
  main({ watch }, function (err) {
    if (err) throw err;
    console.log("Done building templates.");
    if (!watch) process.exit();
  });

  // Rebuilds templates when we load new states
  // using scripts/state/info.js
  let redis = require("models/redis");
  let client = new redis();
  client.subscribe("templates:rebuild");
  client.on("message", function () {
    main({}, function () {});
  });
}

function main(options, callback) {
  buildAll(TEMPLATES_DIRECTORY, options, function (err) {
    if (err) return callback(err);

    buildAll(PAST_TEMPLATES_DIRECTORY, options, function (err) {
      if (err) return callback(err);

      checkForExtinctTemplates(TEMPLATES_DIRECTORY, function (err) {
        if (err) return callback(err);

        if (options.watch) {
          debug("Built all templates.");
          debug("Watching templates directory for changes");
          watch(TEMPLATES_DIRECTORY);
          watch(PAST_TEMPLATES_DIRECTORY);

          // Rebuilds templates when we load new states
          // using scripts/state/info.js
          const templateClient = new redis();

          templateClient.subscribe("templates:rebuild");

          templateClient.on("message", function () {
            main({}, function () {});
          });

          callback(null);
        } else {
          callback(null);
        }
      });
    });
  });
}

// Builds any templates inside the directory
function buildAll(directory, options, callback) {
  var dirs = templateDirectories(directory);

  async.map(dirs, async.reflect(build), function (err, results) {
    results.forEach(function (result, i) {
      if (result.error) {
        if (!options.watch) {
          return callback(result.error);
        } else {
          console.error("Error building: " + dirs[i]);
          console.error(result.error.stack);
        }
      }
    });

    callback();
  });
}

// Path to a directory containing template files
function build(directory, callback) {
  debug("..", require("path").basename(directory), directory);

  var templatePackage, isPublic;
  var name, template, description, id;

  try {
    templatePackage = fs.readJsonSync(directory + "/package.json");
  } catch (e) {
    templatePackage = {};
    console.warn("     ", "Warning: ENOENT " + directory + "/package.json");
    // package.json is optional
  }

  id = TEMPLATES_OWNER + ":" + basename(directory);
  name = templatePackage.name || capitalize(basename(directory));
  description = templatePackage.description || "";
  isPublic = templatePackage.isPublic !== false;

  template = {
    isPublic: isPublic,
    description: description,
    locals: templatePackage.locals,
  };

  // Set the default font for each template
  if (template.locals.body_font !== undefined) {
    template.locals.body_font = _.merge(
      _.cloneDeep(DEFAULT_FONT),
      template.locals.body_font
    );
  }

  if (template.locals.font !== undefined) {
    template.locals.font = _.merge(
      _.cloneDeep(DEFAULT_FONT),
      template.locals.font
    );
  }

  if (template.locals.navigation_font !== undefined) {
    template.locals.navigation_font = _.merge(
      _.cloneDeep(DEFAULT_FONT),
      template.locals.navigation_font
    );
  }

  if (template.locals.syntax_highlighter !== undefined) {
    template.locals.syntax_highlighter = {
      ...HIGHLIGHTER_THEMES.find(
        ({ id }) =>
          id ===
          (template.locals.syntax_highlighter.id || "stackoverflow-light")
      ),
    };
  }

  if (template.locals.coding_font !== undefined) {
    template.locals.coding_font = _.merge(
      _.cloneDeep(DEFAULT_MONO_FONT),
      template.locals.coding_font
    );
  }

  if (template.locals.syntax_highlighter_font !== undefined) {
    template.locals.syntax_highlighter_font = _.merge(
      _.cloneDeep(DEFAULT_MONO_FONT),
      template.locals.syntax_highlighter_font
    );
  }

  Template.drop(TEMPLATES_OWNER, basename(directory), function () {
    Template.create(TEMPLATES_OWNER, name, template, function (err) {
      if (err) return callback(err);

      buildViews(directory, id, templatePackage.views, function (err) {
        if (err) return callback(err);

        emptyCacheForBlogsUsing(id, function (err) {
          if (err) return callback(err);

          if (!isPublic || config.environment !== "development")
            return callback();

          // in development, we want to reset any versions of the template
          // otherwise it seems local changes are not reflected
          removeOldVersionFromTestBlogs(id, function (err) {
            callback();
          });
        });
      });
    });
  });
}

function buildViews(directory, id, views, callback) {
  var viewpaths;

  viewpaths = fs.readdirSync(directory).map(function (n) {
    return directory + "/" + n;
  });

  async.eachSeries(
    viewpaths,
    function (path, next) {
      var viewFilename = basename(path);

      if (viewFilename === "package.json" || viewFilename.slice(0, 1) === ".")
        return next();

      var viewName = viewFilename;
      var viewContent;
      if (viewName.slice(0, 1) === "_") {
        viewName = viewName.slice(1);
      }

      try {
        viewContent = fs.readFileSync(path, "utf-8");
      } catch (err) {
        return next();
      }

      var view = {
        name: viewName,
        content: viewContent,
        url: "/" + viewName,
      };

      if (views && views[view.name]) {
        var newView = views[view.name];
        extend(newView).and(view);
        view = newView;
      }

      Template.setView(id, view, function onSet(err) {
        if (err) {
          view.content = err.toString();
          Template.setView(id, view, function () {});
          err.message += " in " + path;
          return next(err);
        }

        next();
      });
    },
    callback
  );
}

function checkForExtinctTemplates(directory, callback) {
  var names = fs.readdirSync(directory).map(function (name) {
    return name.toLowerCase();
  });

  debug("Checking for extinct templates...");

  Template.getTemplateList("", function (err, templates) {
    if (err) return callback(err);

    templates = templates.filter(function (template) {
      return template.owner === TEMPLATES_OWNER;
    });

    templates = templates.filter(function (template) {
      return names.indexOf(template.name.toLowerCase()) === -1;
    });

    if (templates.length) {
      debug(
        templates.length +
          " templates no longer exist. Please run these scripts to safely remove them from the database:"
      );
    }

    templates.forEach(function (template) {
      debug("node scripts/template/archive.js", template.id.split(":")[1]);
    });

    callback();
  });
}

function watch(directory) {
  // Stop the process from exiting automatically
  process.stdin.resume();
  debug("Watching", directory, "for changes...");

  var queue = async.queue(function (directory, callback) {
    build(directory, function (err) {
      if (err) {
        console.error(err.message);
      }

      callback();
    });
  });

  // When chokidar first crawls a directory to watch
  // it fires 'add' events for every file it finds.
  // We watch until its crawled everything 'ready'
  // in order to actually listen to new changes.
  let ready = false;

  chokidar
    .watch(directory, { cwd: directory })
    .on("ready", function () {
      ready = true;
    })
    .on("all", (event, path) => {
      if (!ready) return;

      if (!path) return;

      const subdirectory = path.split("/")[0];

      if (subdirectory[0] === ".") return;

      queue.push(directory + "/" + subdirectory);
    });
}

// Generate list of template names based on the names of
// directories inside $directory (e.g. ['console', ...])
function templateDirectories(directory) {
  return fs
    .readdirSync(directory)
    .filter(function (name) {
      return (
        name[0] !== "." &&
        name !== "_" &&
        name.toLowerCase().indexOf("readme") === -1
      );
    })
    .map(function (name) {
      return directory + "/" + name;
    });
}

function emptyCacheForBlogsUsing(templateID, callback) {
  Blog.getAllIDs(function (err, ids) {
    if (err) return callback(err);
    async.eachSeries(
      ids,
      function (blogID, next) {
        Blog.get({ id: blogID }, function (err, blog) {
          if (err || !blog || !blog.template || blog.template !== templateID)
            return next();

          Blog.set(blogID, { cacheID: Date.now() }, function (err) {
            if (err) return next(err);

            debug(
              "..",
              templateID,
              "flushed for",
              blog.handle + " (" + blog.id + ")"
            );
            next();
          });
        });
      },
      callback
    );
  });
}

function removeOldVersionFromTestBlogs(templateID, callback) {
  // If we're not in development, we don't want to remove the template from any blogs
  if (config.environment !== "development") return callback();

  Blog.getAllIDs(function (err, ids) {
    if (err) return callback(err);
    async.eachSeries(
      ids,
      function (blogID, next) {
        Blog.get({ id: blogID }, function (err, blog) {
          if (err) return next(err);
          Template.getTemplateList(blogID, function (err, templates) {
            if (err) return next(err);

            const TemplateToRemove = templates.find(function (template) {
              return (
                template.cloneFrom === templateID &&
                template.owner === blogID &&
                template.name.toLowerCase() ===
                  templateID.split(":")[1].toLowerCase()
              );
            });

            if (!TemplateToRemove) return next();

            
            console.log("Removing old version of development template", TemplateToRemove.id);
            Template.drop(blogID, TemplateToRemove.slug, function (err) {
              if (err) return next(err);

              if (TemplateToRemove.id === blog.template) {
                Blog.set(blogID, { template: TemplateToRemove.cloneFrom }, function (err) {
                  if (err) return next(err);
                  console.log("Removed template from", blogID);
                  next();
                });
              } else {
                next();
              }
            });
          });
        });
      },
      callback
    );
  });
}

module.exports = main;
