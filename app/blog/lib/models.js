const { promisify } = require("util");
const Blog = require("models/blog");
const Entry = require("models/entry");
const Entries = require("models/entries");
const Template = require("models/template");
const Tags = require("models/tags");
const Redirects = require("models/redirects");
const User = require("models/user");

// Standard err-first model APIs — safe for util.promisify.
const getBlog = promisify(Blog.get);
const getMetadata = promisify(Template.getMetadata);
const getFullView = promisify(Template.getFullView);
const searchEntries = promisify(Entry.search);
const listTags = promisify(Tags.list);
const popularTags = promisify(Tags.popular);
const checkRedirect = promisify(Redirects.check);
const getUserById = promisify(User.getById);

// getPage's callback is (err, entries, pagination) — promisify would drop pagination.
function getPage(blogID, options) {
  return new Promise((resolve, reject) => {
    Entries.getPage(blogID, options, (err, entries, pagination) => {
      if (err) return reject(err);
      resolve({ entries, pagination });
    });
  });
}

// getViewByURL's callback is (err, viewName, params).
function getViewByURL(template, url) {
  return new Promise((resolve, reject) => {
    Template.getViewByURL(template, url, (err, viewName, params) => {
      if (err) return reject(err);
      resolve({ viewName, params });
    });
  });
}

// Entry.get / getByUrl and several Entries helpers are NOT err-first —
// they omit the error argument. Mirror the adapter used in models/entry/search.js.
function getEntry(blogID, entryIDs, fields) {
  return new Promise((resolve) => {
    if (fields === undefined) {
      Entry.get(blogID, entryIDs, (entries) => resolve(entries));
    } else {
      Entry.get(blogID, entryIDs, fields, (entries) => resolve(entries));
    }
  });
}

function getEntryByUrl(blogID, entryUrl) {
  return new Promise((resolve) => {
    Entry.getByUrl(blogID, entryUrl, (entry) => resolve(entry));
  });
}

function adjacentTo(blogID, entryID) {
  return new Promise((resolve) => {
    Entries.adjacentTo(blogID, entryID, (next, previous, index) => {
      resolve({ next, previous, index });
    });
  });
}

function randomEntry(blogID) {
  return new Promise((resolve) => {
    Entries.random(blogID, (entry) => resolve(entry));
  });
}

// getAll / getRecent callback with (entries) only — never an error argument.
function getAll(blogID, options) {
  return new Promise((resolve) => {
    if (options === undefined) {
      Entries.getAll(blogID, (entries) => resolve(entries));
    } else {
      Entries.getAll(blogID, options, (entries) => resolve(entries));
    }
  });
}

function getRecent(blogID, options) {
  return new Promise((resolve) => {
    if (options === undefined) {
      Entries.getRecent(blogID, (entries) => resolve(entries));
    } else {
      Entries.getRecent(blogID, options, (entries) => resolve(entries));
    }
  });
}

function getTotal(blogID) {
  return promisify(Entries.getTotal)(blogID);
}

module.exports = {
  getBlog,
  getMetadata,
  getFullView,
  getPage,
  searchEntries,
  listTags,
  popularTags,
  checkRedirect,
  getUserById,
  getViewByURL,
  getEntry,
  getEntryByUrl,
  adjacentTo,
  randomEntry,
  getAll,
  getRecent,
  getTotal,
};
