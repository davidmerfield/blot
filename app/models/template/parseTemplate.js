var _ = require("lodash");
var mustache = require("mustache");
var type = require("helper/type");

// My goal is to look at a template
// retrieve a list of variables and partials inside the template
// find those variables which I am allowed to fetch

// and store the relevant method and arguments
// neccessary to retrieve those at run time...

var modules = require("fs").readdirSync(
  __dirname + "/../../blog/render/retrieve"
);

// Build a list of locals which blot will fetch
// returns a list like this:
// ['allEntries', 'recentEntries', 'allTags', 'archives', 'updated', 'appCSS', 'appJS', 'public']
var retrieveThese = _.filter(modules, function (name) {
  return name.charAt(0) !== "." && name !== "index.js";
})
  .map(function (name) {
    return name.slice(0, name.lastIndexOf("."));
  })
  .sort();

function parseTemplate(template) {
  var retrieve = {};
  var partials = {};
  var parsed;

  try {
    parsed = mustache.parse(template);
  } catch (e) {
    return { partials: partials, retrieve: retrieve };
  }

  process("", parsed);

  // This can be used to recursively
  // strip locals and partials we need
  // to fetch from the db before rendering
  // the temaplate
  function process(context, list) {
    if (context) context = context + ".";

    for (var i in list) {
      var token = list[i];

      if (token[0] === "#" && token[1] === "cdn") {
        // Initialize retrieve.cdn as array if it doesn't exist
        if (!retrieve.cdn || !Array.isArray(retrieve.cdn)) {
          retrieve.cdn = [];
        }
        collectCdnTargets(token[4]);
        if (type(token[4], "array")) process(context, token[4]);
        continue;
      }

      // Is a partial
      if (token[0] === ">") {
        // this is dangerous but used to avoid fetching partials twice
        partials[token[1]] = null;
      }

      // Is a variable, '#' starts iterative blocks
      // '&' starts unescaped blocks
      if (
        token[0] === "name" ||
        token[0] === "#" ||
        token[0] === "^" ||
        token[0] === "&"
      ) {
        // e.g. all_entries.length
        var variable = token[1];
        // e.g. all_entries
        var variableRoot =
          variable.indexOf(".") > -1 &&
          variable.slice(0, variable.indexOf("."));

        if (retrieveThese.indexOf(variable) > -1) {
          // Special case: 'cdn' should always be an array (empty for literals, with targets for blocks)
          // to prevent soft merge issues with multiple partials via helper/extend.js
          if (variable === "cdn") {
            if (!retrieve.cdn || !Array.isArray(retrieve.cdn)) {
              retrieve.cdn = [];
            }
          } else {
            retrieve[variable] = true;
          }
        }

        if (retrieveThese.indexOf(variableRoot) > -1) {
          // Special case: 'cdn' should always be an array (empty for literals, with targets for blocks)
          // to prevent soft merge issues with multiple partials via helper/extend.js
          if (variableRoot === "cdn") {
            if (!retrieve.cdn || !Array.isArray(retrieve.cdn)) {
              retrieve.cdn = [];
            }
          } else {
            retrieve[variableRoot] = true;
          }
        }

        // console.log(context + variable);

        for (var x = 0; x < retrieveThese.length; x++) {
          var approved = retrieveThese[x];

          if (approved.indexOf(".") === -1) continue;

          // console.log('--', approved);

          if ((context + variable).indexOf(approved) > -1) {
            var fix = (context + variable).slice(
              (context + variable).indexOf(approved)
            );
            retrieve[fix] = true;
          }
        }

        // There are other tokens inside this block
        // process these recursively
        if (type(token[4], "array")) process(context + variable, token[4]);
      }
    }
  }

  // Ensure retrieve.cdn is sorted and deduplicated
  // Always keep it as an array (even if empty) to prevent soft merge issues
  if (retrieve.cdn && Array.isArray(retrieve.cdn)) {
    retrieve.cdn = [...new Set(retrieve.cdn)].sort();
  }

  return {
    partials: partials,
    retrieve: retrieve,
  };

  function collectCdnTargets(tokens) {
    if (!type(tokens, "array")) return;

    var buffer = "";
    var hasDynamicTokens = false;

    for (var j = 0; j < tokens.length; j++) {
      var child = tokens[j];
      if (child[0] === "text") {
        buffer += child[1];
        continue;
      }

      // Any non-text token means we cannot resolve this target statically
      hasDynamicTokens = true;
      break;
    }

    if (hasDynamicTokens) return;

    var target = buffer.trim();

    if (!target) return;
    if (target.indexOf("//") > -1) return;
    if (target.indexOf(" ") > -1) return;

    if (target[0] === "/") target = target.slice(1);

    // Initialize retrieve.cdn as array if it doesn't exist
    if (!retrieve.cdn || !Array.isArray(retrieve.cdn)) {
      retrieve.cdn = [];
    }

    // Add target to array if not already present
    if (retrieve.cdn.indexOf(target) === -1) {
      retrieve.cdn.push(target);
    }
  }
}

// console.log(parseTemplate('{{#title}}{{#menu}}{{active}}{{/menu}}{{/title}}'));
// console.log(parseTemplate('{{{appCSS}}}'));

module.exports = parseTemplate;
