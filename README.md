# 2peer site

Static one-page site for 2peer. No build step — plain HTML/CSS/vanilla JS.

## Local preview

```bash
python3 -m http.server 4321 --directory site
# → http://localhost:4321
```

## Deploy on Vercel

Config lives in [`../vercel.json`](../vercel.json) at the repo root.

- **Root Directory**: leave at the repo root (do **not** set it to `site/`).
  `outputDirectory: "site"` serves the static files, and `ignoreCommand`
  needs the root git context to diff the `site/` path.
- **Build Command**: none (`buildCommand: null`).
- **Ignored Build Step**: `git diff --quiet HEAD^ HEAD -- site/` — a push that
  doesn't touch `site/` is skipped, so app-only commits don't redeploy the site.

## Dynamic version & downloads

[`main.js`](main.js) fetches `https://api.github.com/repos/vercim/2peer/releases/latest`
at runtime and fills in:

- the version label (hero pill + download section),
- the macOS `.dmg` / `.zip` and Windows `.exe` download links,
- highlights the visitor's detected OS card.

If there are no releases yet (current state), it falls back to
`data-fallback-version` on `<body>` and points every download button at the
GitHub releases page. Once you publish a release with `.dmg`/`.zip`/`.exe`
assets, the buttons wire up automatically — no code change needed.

Update `data-fallback-version` in [`index.html`](index.html) if you want the
pre-release placeholder to match a newer `package.json` version.
