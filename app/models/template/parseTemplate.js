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

var projectedEntryLocals = {
  allEntries: [""],
  all_entries: [""],
  recentEntries: [""],
  recent_entries: [""],
  posts: [""],
  search_results: [""],
  tagged: ["entries"],
  archives: ["months.entries"],
};

function parseTemplate(template) {
  var retrieve = {};
  var partials = {};
  var parsed;

  try {
    parsed = mustache.parse(template);
  } catch (e) {
    return { partials: partials, retrieve: retrieve };
  }

  var projectedFieldContexts = {};

  process("", parsed);

  // Helper function to set nested property in retrieve object
  // Converts boolean values to objects when needed
  function setNestedProperty(root, propertyPath, value) {
    if (!retrieve[root]) {
      retrieve[root] = {};
    } else if (retrieve[root] === true) {
      // Convert boolean to object if we're adding nested properties
      retrieve[root] = {};
    }

    var parts = propertyPath.split(".");
    var current = retrieve[root];
    
    for (var i = 0; i < parts.length - 1; i++) {
      var part = parts[i];
      if (!current[part] || current[part] === true) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }

  function setProjectedEntryField(root, fieldName) {
    if (!projectedEntryLocals[root]) return false;
    if (!fieldName || fieldName.indexOf(".") > -1) return false;

    setNestedProperty(root, "fields." + fieldName, true);
    return true;
  }


  function projectedFieldFromContext(contextPath, variableName) {
    if (!contextPath || !variableName || variableName.indexOf(".") > -1) return null;

    for (var root in projectedEntryLocals) {
      var prefixes = projectedEntryLocals[root] || [];
      for (var i = 0; i < prefixes.length; i++) {
        var prefix = prefixes[i] ? root + "." + prefixes[i] : root;
        if (contextPath === prefix) {
          return { root: root, field: variableName };
        }
      }
    }

    return null;
  }



  function isProjectedPathSegment(contextPath, variableName) {
    if (!contextPath || !variableName || variableName.indexOf(".") > -1) return false;

    for (var root in projectedEntryLocals) {
      var prefixes = projectedEntryLocals[root] || [];
      for (var i = 0; i < prefixes.length; i++) {
        var prefix = prefixes[i];
        if (!prefix) continue;

        var parts = prefix.split(".");
        for (var depth = 0; depth < parts.length; depth++) {
          var currentPath = depth === 0 ? root : root + "." + parts.slice(0, depth).join(".");
          if (contextPath === currentPath && variableName === parts[depth]) {
            return true;
          }
        }
      }
    }

    return false;
  }

  function isProjectedEntryPath(root, propertyPath) {
    if (!projectedEntryLocals[root] || !propertyPath) return false;

    var prefixes = projectedEntryLocals[root] || [];

    for (var i = 0; i < prefixes.length; i++) {
      if (prefixes[i] === propertyPath) return true;
    }

    return false;
  }

  function projectedFieldFromPropertyAccess(root, propertyPath) {
    if (!projectedEntryLocals[root] || !propertyPath) return null;

    var prefixes = projectedEntryLocals[root] || [];

    for (var i = 0; i < prefixes.length; i++) {
      var prefix = prefixes[i];

      if (!prefix) {
        if (propertyPath.indexOf(".") === -1) return propertyPath;
        continue;
      }

      if (propertyPath.indexOf(prefix + ".") !== 0) continue;

      var fieldName = propertyPath.slice((prefix + ".").length);
      if (fieldName && fieldName.indexOf(".") === -1) return fieldName;
    }

    return null;
  }

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
        // e.g. length (or subfolder.property for deeper nesting)
        var propertyPath = variable.indexOf(".") > -1 &&
          variable.slice(variable.indexOf(".") + 1);
        var contextPath = context ? context.slice(0, -1) : "";
        var projectedFieldContext = projectedFieldFromContext(contextPath, variable);
        var inProjectedFieldContext = hasProjectedFieldContextAncestor(contextPath);
        var suppressAsProjectedFieldReference = false;
        var isProjectedFieldInContext = false;

        if (
          projectedFieldContext &&
          isLikelyProjectedEntryField(projectedFieldContext.field)
        ) {
          isProjectedFieldInContext = setProjectedEntryField(
            projectedFieldContext.root,
            projectedFieldContext.field
          );
        }

        if (retrieveThese.indexOf(variable) > -1) {
          // Special case: 'cdn' should always be an array (empty for literals, with targets for blocks)
          // to prevent soft merge issues with multiple partials via helper/extend.js
          if (variable === "cdn") {
            if (!retrieve.cdn || !Array.isArray(retrieve.cdn)) {
              retrieve.cdn = [];
            }
          } else {
            if (projectedEntryLocals[variable]) {
              retrieve[variable] = retrieve[variable] && retrieve[variable] !== true
                ? retrieve[variable]
                : {};
            } else {
              // If variable has no dots, it's a root variable - set as boolean
              // If it has dots, it's a nested property - build nested structure
              if (!propertyPath) {
                retrieve[variable] = true;
              } else {
                // This shouldn't happen for whitelisted variables with dots,
                // but handle it just in case
                retrieve[variable] = true;
              }
            }
          }
        }

        if (retrieveThese.indexOf(variableRoot) > -1 && propertyPath) {
          // Special case: 'cdn' should always be an array (empty for literals, with targets for blocks)
          // to prevent soft merge issues with multiple partials via helper/extend.js
          if (variableRoot === "cdn") {
            if (!retrieve.cdn || !Array.isArray(retrieve.cdn)) {
              retrieve.cdn = [];
            }
          } else {
            var projectedField = projectedFieldFromPropertyAccess(
              variableRoot,
              propertyPath
            );

            if (projectedField) {
              setNestedProperty(variableRoot, "fields." + projectedField, true);
            } else if (isProjectedEntryPath(variableRoot, propertyPath)) {
              retrieve[variableRoot] = retrieve[variableRoot] && retrieve[variableRoot] !== true
                ? retrieve[variableRoot]
                : {};
            } else {
              // Build nested structure for whitelisted root with property access
              setNestedProperty(variableRoot, propertyPath, true);
            }
          }
        } else if (retrieveThese.indexOf(variableRoot) > -1 && !propertyPath) {
          // Root variable without property access - set as boolean if not already an object
          if (variableRoot === "cdn") {
            if (!retrieve.cdn || !Array.isArray(retrieve.cdn)) {
              retrieve.cdn = [];
            }
          } else {
            // Only set as boolean if it's not already an object (from previous nested access)
            if (!retrieve[variableRoot] || retrieve[variableRoot] === true) {
              retrieve[variableRoot] = true;
            }
          }
        }

        // Track all referenced locals (including custom ones) for signature hashing
        // System locals are already tracked above, so only track non-system locals here
        // The retrieve system will safely ignore non-system locals during fetching
        // Skip tracking if variable has dots and root is whitelisted (already handled with nested structure)
        suppressAsProjectedFieldReference =
          (token[0] === "#" || token[0] === "^") && isProjectedFieldInContext;

        if (isProjectedFieldInContext) {
          suppressAsProjectedFieldReference = true;
        }

        if (inProjectedFieldContext && isLikelyProjectedEntryField(variable)) {
          suppressAsProjectedFieldReference = true;
        }

        if (
          retrieveThese.indexOf(variable) === -1 &&
          variable !== "cdn" &&
          !isProjectedPathSegment(contextPath, variable) &&
          !suppressAsProjectedFieldReference
        ) {
          // Only track the root variable, not nested properties
          // If variable has dots and root is whitelisted, skip (already handled above)
          if (!propertyPath || retrieveThese.indexOf(variableRoot) === -1) {
            if (!retrieve[variable]) {
              retrieve[variable] = true;
            }
          }
        }
        
        if (variableRoot && retrieveThese.indexOf(variableRoot) === -1 && variableRoot !== "cdn") {
          if (!retrieve[variableRoot]) {
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
            // For approved variables with dots, build nested structure
            var fixRoot = fix.indexOf(".") > -1 && fix.slice(0, fix.indexOf("."));
            var fixProperty = fix.indexOf(".") > -1 && fix.slice(fix.indexOf(".") + 1);
            
            if (fixRoot && fixProperty && retrieveThese.indexOf(fixRoot) > -1) {
              setNestedProperty(fixRoot, fixProperty, true);
            } else {
              retrieve[fix] = true;
            }
          }
        }

        // There are other tokens inside this block
        // process these recursively
        if ((token[0] === "#" || token[0] === "^") && isProjectedFieldInContext) {
          markProjectedFieldContext(contextPath ? contextPath + "." + variable : variable);
        }

        if (type(token[4], "array")) process(context + variable, token[4]);
      }
    }
  }


  function isLikelyProjectedEntryField(variableName) {
    if (!variableName || variableName.indexOf(".") > -1) return false;

    // Uppercase characters usually indicate a non-entry local, e.g. siteTitle
    return /^[a-z0-9_]+$/.test(variableName);
  }

  function markProjectedFieldContext(contextPath) {
    if (!contextPath) return;
    projectedFieldContexts[contextPath] = true;
  }

  function hasProjectedFieldContextAncestor(contextPath) {
    if (!contextPath) return false;

    var current = contextPath;
    while (current) {
      if (projectedFieldContexts[current]) return true;
      var lastDot = current.lastIndexOf(".");
      current = lastDot > -1 ? current.slice(0, lastDot) : "";
    }

    return false;
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
    // Add path traversal checks
    if (target.indexOf("..") > -1) return;
    if (target.indexOf("\\") > -1) return; // Windows path separators
    if (target.indexOf("\0") > -1) return; // Null bytes
    if (target.length > 255) return; // Reasonable length limit

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

function getPartialContexts(template, parentContextPath) {
  var partialContexts = {};
  var parsed;

  try {
    parsed = mustache.parse(template || "");
  } catch (e) {
    return partialContexts;
  }

  collect(parentContextPath || "", parsed);

  return partialContexts;

  function addContext(partialName, contextPath) {
    if (!partialContexts[partialName]) partialContexts[partialName] = [];
    if (partialContexts[partialName].indexOf(contextPath) === -1) {
      partialContexts[partialName].push(contextPath);
    }
  }

  function collect(contextPath, tokens) {
    if (!type(tokens, "array")) return;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var tokenType = token[0];
      var tokenValue = token[1];

      if (tokenType === ">") {
        addContext(tokenValue, contextPath);
      }

      if ((tokenType === "#" || tokenType === "^") && type(token[4], "array")) {
        var nextContext = contextPath
          ? contextPath + "." + tokenValue
          : tokenValue;
        collect(nextContext, token[4]);
      }
    }
  }
}

// console.log(parseTemplate('{{#title}}{{#menu}}{{active}}{{/menu}}{{/title}}'));
// console.log(parseTemplate('{{{appCSS}}}'));

parseTemplate.getPartialContexts = getPartialContexts;

module.exports = parseTemplate;
