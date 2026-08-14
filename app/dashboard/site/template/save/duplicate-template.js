const makeSlug = require("helper/makeSlug");
const makeID = require("models/template/util/makeID");
const createTemplate = require("./create-template");
const { MAX_DEDUPLICATION_ATTEMPTS } = require("./constants");

// Template.create derives a template's id from makeSlug(name).slice(0, 30)
const MAX_SLUG_LENGTH = 30;

// The id is what routing resolves a template by, and writeToFolder names the
// template's directory after the stored slug, which readFromFolder then turns
// back into an id. Let the two disagree and a locally edited copy can be read
// back as the template it was copied from, so derive the slug from the id.
const slugFor = (owner, name) =>
  makeID(owner, name).split(":").slice(1).join(":");

// A name whose slug already fills those 30 characters leaves no room for
// ' copy', so the copy derives the same id as the template it came from and
// collides with it. Make room by trimming the name — but only the name, never
// the suffix: trimming the whole thing would eat the word 'copy' first,
// leaving a copy which does not say it is one and which parseCopyName can no
// longer recognise when it is itself duplicated.
const withCopySuffix = (nameBase, counter) => {
  const suffix = counter > 1 ? ` copy ${counter}` : " copy";

  let trimmed = nameBase.trim();

  while (
    trimmed.length > 1 &&
    makeSlug(`${trimmed}${suffix}`).length > MAX_SLUG_LENGTH
  ) {
    trimmed = trimmed.slice(0, -1).trim();
  }

  return `${trimmed}${suffix}`.trim();
};

const COPY_NAME_PATTERN = /^(.*?)(?: copy(?: (\d+))?)$/;
const COPY_SLUG_PATTERN = /^(.*?)(?:-copy(?:-(\d+))?)$/;

function parseCopyName(name) {
  const match = (name || "").trim().match(COPY_NAME_PATTERN);

  if (match) {
    return {
      base: match[1].trim(),
      counter: match[2] ? parseInt(match[2], 10) : 1,
    };
  }

  return {
    base: (name || "").trim(),
    counter: 1,
  };
}

function parseCopySlug(slug) {
  const match = (slug || "").match(COPY_SLUG_PATTERN);

  if (match) {
    return {
      base: match[1],
      counter: match[2] ? parseInt(match[2], 10) : 1,
    };
  }

  return {
    base: slug || "",
    counter: 1,
  };
}

async function duplicateTemplate({ owner, template }) {
  if (!template || !template.id) {
    throw new Error("A template is required to duplicate");
  }

  if (!owner) {
    throw new Error("An owner is required to duplicate a template");
  }

  const { base: nameBase, counter: nameCounter } = parseCopyName(template.name);
  // Only the counter: the slug now follows whatever name we settle on
  const { counter: slugCounter } = parseCopySlug(template.slug);

  let deduplicationCounter = Math.max(nameCounter, slugCounter, 1);
  let attemptName = withCopySuffix(nameBase, 1);
  let attempts = 0;

  while (attempts < MAX_DEDUPLICATION_ATTEMPTS) {
    attempts++;

    try {
      return await createTemplate({
        isPublic: false,
        owner,
        name: attemptName,
        slug: slugFor(owner, attemptName),
        cloneFrom: template.id,
      });
    } catch (error) {
      if (
        error &&
        error.code === "EEXISTS" &&
        attempts < MAX_DEDUPLICATION_ATTEMPTS
      ) {
        deduplicationCounter = Math.max(deduplicationCounter, 1) + 1;
        attemptName = withCopySuffix(nameBase, deduplicationCounter);
        continue;
      }

      throw error;
    }
  }

  const err = new Error("Unable to duplicate template after multiple attempts");
  err.code = "EEXISTS";
  throw err;
}

module.exports = duplicateTemplate;
module.exports._internal = {
  parseCopyName,
  parseCopySlug,
};
