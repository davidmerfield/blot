const config = require("config");
const fs = require("fs-extra");
const { marked } = require("marked");
const prettySize = require("helper/prettySize");
const path = require("path");

const templatesDirectory = path.join(__dirname, "../templates/latest");
const archivedTemplatesDirectory = path.join(__dirname, "../templates/past");
const foldersDirectory = path.join(__dirname, "../templates/folders");
const { getMetadata } = require("models/template");

// If the template name needs to be mapped to a different name
// than first letter capitalized, add it here
const NAME_MAP = {
  'cv': 'CV',
};

const featuredTemplates = [
  "cv",
  "blog",
  "portfolio",
  "event",
  "documentation",
  "magazine",
  "painter",
  "photographer",
  "rosa",
  "reference",
  "isola",
  "manifesto",
];

const categories = [
  {
    name: "Blogging",
    slug: "blogging",
    templates: [
      "blog",
      "magazine",
      "isola",
      "rosa",
      "manifesto",
      "index",
    ]
  },
  {
    name: "Photography",
    slug: "photography",
    templates: [
      "portfolio",
      "reference",
      "illustrator",
      "painter",
      "photographer",
      "grid",
      "photo",
      "photo-old"
    ]
  },
  {
    name: "Personal & CV",
    slug: "personal",
    templates: [
      "cv",
      "painter",
      "marfa"
    ]
  },
  {
    name: "Organizations",
    slug: "organizations",
    templates: [
      "event",
      "forty",
      "documentation",
    ]
  }
];

// Helper function to get template metadata
const getTemplate = async slug => {
  try {
    return await new Promise((resolve, reject) => {
      getMetadata("SITE:" + slug, (err, template) => {
        if (err) return reject(err);
        resolve(template);
      });
    });
  } catch (error) {
    return null;
  }
};

// Load folders
const loadFolders = async () => {
  const folderNames = await fs.readdir(foldersDirectory);
  return folderNames
    .filter(i => !i.startsWith(".") && !i.endsWith(".js") && !i.endsWith(".md"))
    .map(i => ({
      name: NAME_MAP[i] || i[0].toUpperCase() + i.slice(1),
      demo_folder: i,
      source: `https://github.com/davidmerfield/Blot/tree/master/app/templates/folders/${i}`,
      slug: i
    }));
};

// Load templates
const loadTemplates = async () => {
  const latestTemplateFiles = await fs.readdir(templatesDirectory);
  const archivedTemplateFiles = await fs.readdir(archivedTemplatesDirectory);
  const templateFiles = [...latestTemplateFiles, ...archivedTemplateFiles]
    .filter(i => !i.startsWith(".") && !i.endsWith(".js") && !i.endsWith(".md") && !i.includes("wordpress-export"));

  const templates = await Promise.all(templateFiles.map(async i => {
    const template = await getTemplate(i);
    if (!template) return null;
    const demo_folder = template.locals.demo_folder || "david";
    return {
      name: i[0].toUpperCase() + i.slice(1),
      slug: i,
      demo_folder,
      source: `https://github.com/davidmerfield/Blot/tree/master/app/templates/${ latestTemplateFiles.includes(i) ? 'latest' : 'past'}/${i}`,

    };
  }));

  const folders = (await loadFolders()).filter(
    folder => !templates.some(template => template.demo_folder === folder.slug)
  );

  const all = folders.concat(templates.filter(i => i));

  const featured = all.filter(t => featuredTemplates.includes(t.slug)).sort((a, b) => {
    return featuredTemplates.indexOf(a.slug) - featuredTemplates.indexOf(b.slug);
  });

  const sortedTemplates = featured.concat(
    all.filter(t => !featuredTemplates.includes(t.slug))
  );

  return sortedTemplates;
};

// Middleware function
module.exports = async (req, res, next) => {
  try {
    res.locals.categories = categories.slice(0).map(category => {
      category.selected = category.slug === req.params.type ? 'selected' : '';
      return category;
    });

    res.locals.allTemplates = await loadTemplates();

    if (req.params.type) {
      res.locals.category = req.params.type;
      res.locals.allTemplates = res.locals.allTemplates.filter(
        t => categories.find(c => c.slug === req.params.type).templates.includes(t.slug)
      );
    } 

    if (req.params.template) {
      const template = res.locals.allTemplates.find(
        t => t.slug === req.params.template
      );

      if (template) {
        res.locals.template = { ...template };

        const preview_host = template.demo_folder === req.params.template ?
        `${template.demo_folder}.${config.host}`
         : 
          `preview-of-${req.params.template}-on-${template.demo_folder}.${config.host}`;
        res.locals.template.preview = `${config.protocol}${preview_host}`;
        res.locals.template.preview_host = preview_host;

        const zip_name = `${template.demo_folder}.zip`;
        const zip = `/folders/${zip_name}`;
        const pathToZip = path.join(config.views_directory, zip);

        if (await fs.pathExists(pathToZip)) {
          res.locals.template.zip = zip;
          res.locals.template.zip_name = zip_name;
          res.locals.template.zip_size = prettySize(
            (await fs.stat(pathToZip)).size / 1000,
            1
          );

          const readmePath = path.join(templatesDirectory, req.params.template, "README");
          if (await fs.pathExists(readmePath)) {
            res.locals.template.README = marked.parse(
              await fs.readFile(readmePath, "utf8")
            );
          }
        }
      }
    }


    next();
  } catch (error) {
    next(error);
  }
};