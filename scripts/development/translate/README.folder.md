# {{title}}

This folder is a Blot site. Everything in it — the writing, the images, and the
design — is here as ordinary files. Blot turns the files into a website; drop
this folder into your own Blot site's folder and you get the same site.

The design was translated from {{sourceURL}} on {{date}}.

## What is where

| Path | What it is |
|---|---|
| Files at the root | Your posts. One file per post. |
| `Pages/` | Pages rather than posts. These appear on the site's menu. |
| `Templates/{{templateSlug}}/` | The design. Editing these files changes how the site looks. |
| Files starting with `_` | Images and other assets. Never published as posts. |

## Writing posts

A post is just a file — Markdown (`.txt`, `.md`), Word, HTML, an image, and more.
Add a file, and it appears on the site. Edit it, and the site updates. Delete it,
and the post goes.

Optional metadata goes at the top of the file, followed by a blank line:

```
Date: January 1st, 2024
Tags: Recipes, Travel
Link: /a-custom-url

# The title of the post

The post itself starts here.
```

Two things worth knowing:

- **Dates.** A post's date comes from a `Date:` line, or from a dated path like
  `2024/03-12-my-post.txt`. With neither, Blot falls back to the moment the file
  was added, which is rarely what you want for older writing. It does **not** use
  the file's modified date.
- **Tags** can also come from the path: a file in a folder called `[Recipes]`, or
  named `[Recipes] Bread.txt`, is tagged *Recipes*.

## The design

The template lives in `Templates/{{templateSlug}}/`. It has its own `README`
explaining how it is put together.

If your Blot site is set up for local folder editing, changes you make there take
effect on your site. The `package.json` in that folder sets `"enabled": true`,
which tells Blot to install this template when the folder is added.

## Notes from the translation

{{notes}}
