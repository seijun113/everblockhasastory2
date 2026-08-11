# Every Block Has a Story — GitHub Pages package

Everything in this folder is the whole site, ready to push to a GitHub repo and host for free with GitHub Pages. It's fully static (no server, no build step) — accounts, shirt-code verification, and posted stories all live in the visitor's own browser via `localStorage`.

## What's in here

- `index.html`, `stories.html`, `story.html`, `share.html`, `shop.html`, `map.html`, `about.html`, `contact.html` — the pages
- `style.css`, `script.js` — shared styles and behavior
- `shirt-photo-ai.png` — the product photo used on the homepage and shop page

## Option A — no git required (fastest)

1. Go to [github.com/new](https://github.com/new) and create a new repository (public, so Pages can be free). Don't add a README/gitignore when creating it.
2. On the empty repo's page, click **uploading an existing file**.
3. Drag every file from this folder into the upload box (all of them, at the top level — not inside a subfolder).
4. Commit the upload.
5. Go to the repo's **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
6. GitHub gives you a URL like `https://yourusername.github.io/your-repo-name/` within a minute or two.

## Option B — with git (better for future updates)

```bash
cd github-pages-site
git init
git add .
git commit -m "Initial site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

Then enable Pages the same way as step 5 above.

## Updating the site later

- **Option A folks:** go back to the repo on github.com, click into a file, hit the pencil/edit icon, make your change, commit. Or use "Add file → Upload files" again to overwrite files in bulk.
- **Option B folks:** edit the files locally, then:
  ```bash
  git add .
  git commit -m "describe what changed"
  git push
  ```
  GitHub Pages automatically redeploys within a minute or two of any push to `main`.

## Custom domain (optional)

If you buy a domain (from any registrar), add a `CNAME` file at the root of this repo containing just the domain, e.g.:
```
everyblockhasastory.com
```
then point the domain's DNS at GitHub Pages (A records to GitHub's IPs, or a CNAME record to `yourusername.github.io` for a subdomain) in your registrar's DNS settings, and add the domain under Settings → Pages → Custom domain in the repo.

## Note on file size

`shirt-photo-ai.png` is ~2.3 MB, which is fine for GitHub Pages but will make that image slow to load on a slower connection. If you want faster load times later, converting it to a compressed JPEG or WebP would shrink it substantially with no visible quality loss — happy to do that if you want.
