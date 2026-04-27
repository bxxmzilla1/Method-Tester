<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/781876a0-5c93-4d0a-849e-6e96a514c10e

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Copy [.env.example](.env.example) to `.env` or `.env.local` and set variables as needed.
3. Run the app: `npm run dev` (Express + Vite middleware on port 3000)

### PWA

The Vite build includes a web app manifest and service worker (`vite-plugin-pwa`). After `npm run build`, install prompts appear on supported browsers when the site is served over HTTPS.

### Deploy to Vercel (static UI)

Vercel runs `npm run build` and serves the `dist` folder (see [vercel.json](vercel.json)).

The UI talks to `/api` on the same origin when `VITE_API_BASE_URL` is unset. **The Express API, SQLite database, and file uploads in [server.ts](server.ts) are not part of that static output.** For a full production setup you can:

- Host this repo’s `server.ts` on a Node-friendly platform (Railway, Render, Fly.io, a VPS), and set `VITE_API_BASE_URL` and `VITE_LINK_BASE_URL` on Vercel to that host’s public URL, plus `CORS_ORIGIN` on the server to your `*.vercel.app` (or custom) domain; or
- Keep everything on one Node host that runs `npm run build` then `NODE_ENV=production npm start` (not Vercel’s static-only flow).

In the Vercel project settings, add any `VITE_*` variables you need; they are inlined at build time.

### Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

Then import the repository in the Vercel dashboard and deploy.
