// Provision (or reuse) a development site and scaffold a locally-edited template
// for it. Runs INSIDE the container — model resolution needs NODE_PATH=app.
//
//   docker exec blot-node-app-1 node scripts/development/translate <url> <handle>
//
// Prints machine-readable "key=value" lines for translate.sh to consume, plus
// human-readable output on stderr.

const { promisify } = require("util");
const { execFile } = require("child_process");
const fs = require("fs-extra");
const { join } = require("path");

const config = require("config");
const User = require("models/user");
const Blog = require("models/blog");
const Template = require("models/template");
const client = require("models/client");
const localPath = require("helper/localPath");
const nsv = require("helper/nsv");

const { resolve: resolveHandle } = require("./handle");

// Hardcoded in app/configure-local-blogs.js:6 — not configurable, and not
// config.admin.email (which is unset and would resolve to folders@example.com,
// the account that owns the demo folders).
const DEV_EMAIL = "example@example.com";
const DEV_PASSWORD = "password";

const CLONE_FROM = "SITE:blog";
const LOCAL_CLIENT_CHANNEL = "clients:local:new-folder";
const BANNED_HANDLES = nsv(
  join(config.blot_directory, "app/models/blog/validate/banned.txt")
);

const getUserByEmail = promisify(User.getByEmail);
const hashPassword = promisify(User.hashPassword);
const createUser = promisify(User.create);
const generateAccessToken = promisify(User.generateAccessToken);
const getBlog = promisify(Blog.get);
const setBlog = promisify(Blog.set);
const createBlog = promisify(Blog.create);
const createTemplate = promisify(Template.create);
const setTemplateMetadata = promisify(Template.setMetadata);
const writeTemplateToFolder = promisify(Template.writeToFolder);
const execFileAsync = promisify(execFile);

const log = (...args) => console.error("[translate]", ...args);
const emit = (key, value) => console.log(`${key}=${value}`);

// ------------------------------------------------------------------ user

async function establishUser() {
  const existing = await getUserByEmail(DEV_EMAIL);

  if (existing) return existing;

  // Mirrors app/configure-local-blogs.js so a fresh Redis works, rather than
  // failing with a confusing "no user" error.
  log(`Creating development user ${DEV_EMAIL}`);
  const passwordHash = await hashPassword(DEV_PASSWORD);
  return createUser(DEV_EMAIL, passwordHash, {}, {});
}

// ------------------------------------------------------------------ blog

async function establishBlog(user, requestedHandle, url) {
  const isTaken = (candidate) => BANNED_HANDLES.indexOf(candidate) > -1;

  // Reserve a handle that is at least not banned before we start looking it up.
  let handle = resolveHandle(requestedHandle, isTaken);

  if (!handle) throw new Error(`Could not find a free handle for ${url}`);

  // Walk candidates until we find one that is free, or one that is already ours.
  for (let n = 0; n < 100; n++) {
    const existing = await getBlog({ handle });

    if (!existing) break;

    if (existing.owner === user.uid) {
      log(`Reusing site ${handle} (${existing.id})`);
      return { blog: existing, created: false };
    }

    // Owned by somebody else — same guard as setupBlogs.js, but we can just
    // move to the next candidate rather than failing outright.
    handle = resolveHandle(requestedHandle, (candidate) => {
      return isTaken(candidate) || candidate === handle;
    });

    if (!handle) throw new Error(`Could not find a free handle for ${url}`);
  }

  log(`Creating site ${handle}`);

  const blog = await createBlog(user.uid, {
    handle,
    title: handle,
    // Matches app/configure-local-blogs.js: local development is served over
    // http as well as https, so forcing SSL breaks the preview subdomains.
    forceSSL: false,
  });

  return { blog, created: true };
}

async function useLocalClient(blog) {
  if (blog.client !== "local" || blog.forceSSL) {
    await setBlog(blog.id, { client: "local", forceSSL: false });
  }

  // The watcher must start in the MASTER process; calling clients/local.setup()
  // from here would start one in this short-lived process and lose it on exit.
  // app/clients/local/init.js:46 does JSON.parse on the message, so a bare blog
  // ID throws in the server log and the watcher silently never starts.
  await client.publish(LOCAL_CLIENT_CHANNEL, JSON.stringify({ blogID: blog.id }));
}

// -------------------------------------------------------------- template

async function establishTemplate(blog, name) {
  let template;

  try {
    template = await createTemplate(blog.id, name, { cloneFrom: CLONE_FROM });
    log(`Created template ${template.id} from ${CLONE_FROM}`);
  } catch (err) {
    if (err.code !== "EEXISTS") throw err;

    const id = Template.makeID(blog.id, name);
    template = await promisify(Template.getMetadata)(id);
    log(`Reusing template ${template.id}`);
  }

  await setTemplateMetadata(template.id, { localEditing: true });
  await writeTemplateToFolder(blog.id, template.id);

  // Install it so the local site renders with it during verification.
  await setBlog(blog.id, { template: template.id });

  return promisify(Template.getMetadata)(template.id);
}

// ------------------------------------------------------------------- git

async function git(folder, args) {
  return execFileAsync("git", ["-C", folder, ...args], {
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "translate",
      GIT_AUTHOR_EMAIL: "translate@local",
      GIT_COMMITTER_NAME: "translate",
      GIT_COMMITTER_EMAIL: "translate@local",
    },
  });
}

async function establishRepository(blog) {
  const folder = localPath(blog.id, "/");

  if (await fs.pathExists(join(folder, ".git"))) return false;

  log("Initialising git repository");

  // Screenshots and agent notes are regenerated every run; keeping them out of
  // the history stops it filling with large binaries.
  await fs.outputFile(
    join(folder, ".gitignore"),
    ".verification/\n"
  );

  await git(folder, ["init", "--quiet"]);
  await git(folder, ["add", "-A"]);
  await git(folder, ["commit", "--quiet", "-m", "Scaffold site and template"]);

  return true;
}

// ------------------------------------------------------------------ main

async function main(url, requestedHandle) {
  if (!url) throw new Error("Pass the URL to translate as the first argument");
  if (!requestedHandle) throw new Error("Pass a handle as the second argument");

  if (config.environment !== "development") {
    throw new Error("translate is a development-only script");
  }

  const user = await establishUser();
  const { blog, created } = await establishBlog(user, requestedHandle, url);

  await useLocalClient(blog);

  const template = await establishTemplate(blog, "Translated");
  const repositoryCreated = await establishRepository(blog);

  const token = await generateAccessToken({ uid: user.uid });
  const slug = template.id.split(":").slice(1).join(":");

  emit("blogID", blog.id);
  emit("handle", blog.handle);
  emit("folder", localPath(blog.id, "/"));
  emit("templateID", template.id);
  emit("templateSlug", slug);
  emit("siteURL", `${config.protocol}${blog.handle}.${config.host}`);
  emit(
    "previewURL",
    `${config.protocol}preview-of-my-${slug}-on-${blog.handle}.${config.host}`
  );
  emit(
    "dashboardURL",
    `${config.protocol}${config.host}/sites/log-in?token=${token}`
  );
  emit("created", created);
  emit("repositoryCreated", repositoryCreated);
}

if (require.main === module) {
  main(process.argv[2], process.argv[3])
    .then(() => process.exit(0))
    .catch((err) => {
      log("Error:", err.message);
      process.exit(1);
    });
}

module.exports = main;
