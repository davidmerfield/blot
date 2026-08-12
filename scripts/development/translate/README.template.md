# {{templateName}}

A Blot template, translated from the design at {{sourceURL}} on {{date}}.

This file is also the brief for whoever — or whatever — edits this template next.

## How a Blot template works

Every file here is a **view**. Views are rendered with
[Mustache](https://mustache.github.io/mustache.5.html), whatever their extension:
HTML, CSS, JavaScript, RSS and XML views are all rendered the same way, so a
stylesheet can use `{{background_color}}` just as a page can.

`package.json` is the configuration:

- `locals` — variables available to every view.
- `views` — per-view settings: `url` for routing, and `partials` for small
  inline strings such as the page title.
- `enabled: true` — installs this template when the folder is added to a site.
  Leave it in place.

## Which view renders which page

| View | When it renders |
|---|---|
| `entries.html` | The homepage, and `/page/2`, `/page/3`… |
| `entry.html` | A single post |
| `archives.html` | The archives listing |
| `tagged.html` | `/tagged/some-tag` |
| `search.html` | `/search?q=…` |
| `error.html` | 404s and render failures |
| `feed.rss`, `sitemap.xml`, `robots.txt` | Exactly what they say |

**A view's default URL keeps its file extension.** `archives.html` is served at
`/archives.html`, not `/archives`. That is why `package.json` maps it explicitly:

```json
"views": { "archives.html": { "url": "/archives" } }
```

If you add a view and cannot find it at the URL you expected, this is why.

## Partials

`{{> header}}` includes the view named `header.html`. Partials inherit the
surrounding context, so they can use the same variables as the view including
them.

`{{> /Pages/About.txt}}` — a partial whose name starts with `/` includes the
rendered HTML of that file from the site's folder.

## Rules that are easy to trip over

- **No subdirectories.** Every view lives in this folder's root. Files in
  subdirectories are ignored.
- **No Sass or SCSS.** Plain CSS only; nothing is compiled.
- **Escaping.** `{{value}}` escapes HTML. Use `{{{value}}}` for anything
  containing markup or slashes — `{{{url}}}`, `{{{html}}}`, `{{{body}}}`.
- **No duplicate basenames.** `feed.xml` and `feed.rss` collide, because views
  are also resolved with their extension stripped.
- **2 MB per view.** Larger files are skipped.

## Working on the design

Append `?json=true` to any page on the site to see the exact data the template is
rendered with. That is the fastest way to find out what is available.

Keep the template portable. It will be used on other people's sites, so never
hardcode a hostname, a CDN address, or a site ID. Reference template assets with
`{{#cdn}}/style.css{{/cdn}}`, and folder assets with ordinary relative paths.

## Locals this template uses

{{locals}}
