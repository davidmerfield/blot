const createTemplate = require("./create-template");
const { MAX_DEDUPLICATION_ATTEMPTS } = require("./constants");

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
  const { base: slugBase, counter: slugCounter } = parseCopySlug(template.slug);

  const baseName = `${nameBase} copy`.trim();
  const baseSlug = `${slugBase}-copy`;

  let deduplicationCounter = Math.max(nameCounter, slugCounter, 1);
  let attemptName = baseName;
  let attemptSlug = baseSlug;
  let attempts = 0;

  while (attempts < MAX_DEDUPLICATION_ATTEMPTS) {
    attempts++;

    try {
      return await createTemplate({
        isPublic: false,
        owner,
        name: attemptName,
        slug: attemptSlug,
        cloneFrom: template.id,
      });
    } catch (error) {
      if (
        error &&
        error.code === "EEXISTS" &&
        attempts < MAX_DEDUPLICATION_ATTEMPTS
      ) {
        deduplicationCounter = Math.max(deduplicationCounter, 1) + 1;
        attemptName = `${baseName} ${deduplicationCounter}`;
        attemptSlug = `${baseSlug}-${deduplicationCounter}`;
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
