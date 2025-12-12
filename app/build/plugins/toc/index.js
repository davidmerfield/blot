const makeSlug = require("helper/makeSlug");

function render($, callback) {
  const headings = $("h1, h2, h3, h4, h5, h6");

  if (!headings.length) return callback(null);

  const nodes = [];
  const stack = [{ level: 0, children: nodes }];
  const idCounts = Object.create(null);

  headings.each(function (_, el) {
    const $heading = $(el);
    const text = ($heading.text() || "").trim();

    if (!text) return;

    const tagName = ((el && el.name) || "").toUpperCase();
    const level = +tagName.replace("H", "");

    if (!level) return;

    let id = $heading.attr("id") || makeSlug(text) || "section";

    if (!idCounts[id]) {
      idCounts[id] = 1;
    } else {
      idCounts[id] += 1;
      id = `${id}-${idCounts[id]}`;
    }

    $heading.attr("id", id);

    const node = { level, id, text, children: [] };

    while (stack.length > 1 && level <= stack[stack.length - 1].level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    parent.children.push(node);
    stack.push(node);
  });

  if (!nodes.length) return callback(null);

  const tocHTML = `<nav id="TOC" role="doc-toc">${toHTML(nodes)}</nav>`;

  callback(null, { toc: tocHTML });
}

function escapeHTML(string) {
  return string
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toHTML(items) {
  if (!items.length) return "";

  let html = "<ul>";

  items.forEach(function (item) {
    html += `<li><a href="#${item.id}" id="toc-${item.id}">${escapeHTML(item.text)}</a>`;

    html += toHTML(item.children);

    html += "</li>";
  });

  html += "</ul>";

  return html;
}

module.exports = {
  title: "Table of contents",
  description: "Automatically generate a table of contents from headings in your posts.",
  category: "headings",
  optional: true,
  isDefault: false,
  render,
};
