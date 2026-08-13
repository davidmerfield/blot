const createTemplateWithUniqueName = require("./create-template-with-unique-name");

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

  const baseName = `${nameBase} copy`.trim();

  return createTemplateWithUniqueName({
    isPublic: false,
    owner,
    name: baseName,
    cloneFrom: template.id,
    // 'Original copy 3' starts counting from 3, so the next free name is 4
    startCounter: Math.max(nameCounter, slugCounter, 1),
    exhaustedMessage: "Unable to duplicate template after multiple attempts",
  });
}

module.exports = duplicateTemplate;
module.exports._internal = {
  parseCopyName,
  parseCopySlug,
};
