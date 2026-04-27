<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/781876a0-5c93-4d0a-849e-6e96a514c10e

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Create a [Supabase](https://supabase.com/) project. In the SQL Editor, run [supabase/migrations/001_initial.sql](supabase/migrations/001_initial.sql) to create the `links` and `visits` tables and the `link-screenshots` storage bucket.
3. Copy [.env.example](.env.example) to `.env` or `.env.local` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API). The service role key must stay on the server only.
4. Run the app: `npm run dev` (Express + Vite middleware on port 3000)

Link rows, bios, screenshot files, and every visit (IP-derived country for analytics) are stored in Supabase (Postgres + Storage).

### PWA

The Vite build includes a web app manifest and service worker (`vite-plugin-pwa`). After `npm run build`, install prompts appear on supported browsers when the site is served over HTTPS.

### Deploy to Vercel (PWA + API + Supabase)

Vercel runs `npm run build`, serves the `dist` static assets, and runs serverless routes under [`api/`](api/) (see [vercel.json](vercel.json)):

- `GET` / `POST /api/links` — list and create links. The UI sends JSON (`screenshotBase64` + `screenshotMime` when an image is attached), which works on Vercel serverless and locally with Express.
- Short URLs like `/your-slug` are rewritten to `api/link-page` to show the landing page and record a visit.

**Environment variables** (Project → Settings → Environment Variables), for **Production** and **Preview**:

| Name | Notes |
|------|--------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** — never use `VITE_*` for this |
| `CORS_ORIGIN` | Optional — only if the UI is on another origin (e.g. `https://your-app.vercel.app`) |

The UI calls `/api` on the same deployment when `VITE_API_BASE_URL` is unset. For a **local** dev server, use `npm run dev` ([server.ts](server.ts)). Vercel’s request body size limit may be lower than 5 MB depending on plan; shrink screenshots if uploads fail.

Add any `VITE_*` variables needed for the frontend; they are inlined at build time.

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
