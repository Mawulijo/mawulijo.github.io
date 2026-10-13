# Portfolio

Static site (no framework) with a small CMS at `/admin/`, deployed to GitHub Pages.

- `content/site.json` is all the content. The site renders from it.
- `/admin/` edits that file and commits it through the GitHub API, which triggers a redeploy.
- `scripts/build.mjs` builds `dist/` and derives `admin/auth.json` from secrets.

## Setup
1. Push to a GitHub repo, then Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions: add `CMS_USERNAME` and `CMS_PASSWORD` (use a long passphrase).
3. Push to `main`. The workflow builds and deploys.
4. Open `/admin/`, sign in, then in the **GitHub** tab set `owner/repo` and a fine-grained token (this repo only, Contents: read/write). Edit, then "commit".

Local preview: `npm run dev` (login `admin` / `local-dev-passphrase`, or set `CMS_USERNAME`/`CMS_PASSWORD`).

## Security model (read this)
GitHub Pages is static, so there is no server to check a password. The login is a **client-side gate**:
- The secrets are never published. Only salted PBKDF2-SHA256 hashes (310k iterations) are shipped in `admin/auth.json`.
- But those hashes are public, so an attacker can brute-force them offline. A weak password is crackable; use 16+ random characters.
- The gate does not protect your content. **The GitHub token does**: without a token with write access to the repo, nobody can publish changes, whatever they do in the UI.
- The token lives in `sessionStorage` only and is cleared on sign-out or after the 30-minute session expires.
