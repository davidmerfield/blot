const createTemplate = require("./create-template");
const { MAX_DEDUPLICATION_ATTEMPTS } = require("./constants");

// Template.create() has no collision handling of its own: it returns an error
// with code EEXISTS when a template with the same derived ID already exists.
// Note the ID is derived from the *name*, not the slug, so callers which want
// the two to agree should pass a slug derived from the same name.
//
// The first attempt uses `name` and `slug` verbatim. Each subsequent attempt
// appends an incrementing counter until one succeeds or we give up.
const defaultFormatName = (base, counter) => `${base} ${counter}`;
const defaultFormatSlug = (base, counter) => `${base}-${counter}`;

async function createTemplateWithUniqueName ({
  owner,
  name,
  slug,
  startCounter = 1,
  formatName = defaultFormatName,
  formatSlug = defaultFormatSlug,
  exhaustedMessage = "Unable to create a template with a unique name after multiple attempts",
  ...properties
}) {
  if (!owner) {
    throw new Error("An owner is required to create a template");
  }

  if (!name) {
    throw new Error("A name is required to create a template");
  }

  let counter = Math.max(startCounter, 1);
  let attemptName = name;
  let attemptSlug = slug;
  let attempts = 0;

  while (attempts < MAX_DEDUPLICATION_ATTEMPTS) {
    attempts++;

    try {
      return await createTemplate({
        ...properties,
        owner,
        name: attemptName,
        slug: attemptSlug,
      });
    } catch (error) {
      if (
        error &&
        error.code === "EEXISTS" &&
        attempts < MAX_DEDUPLICATION_ATTEMPTS
      ) {
        counter = Math.max(counter, 1) + 1;
        attemptName = formatName(name, counter);
        // Template.create derives the slug from the name when none is given
        attemptSlug = slug ? formatSlug(slug, counter) : slug;
        continue;
      }

      throw error;
    }
  }

  const err = new Error(exhaustedMessage);
  err.code = "EEXISTS";
  throw err;
}

module.exports = createTemplateWithUniqueName;
