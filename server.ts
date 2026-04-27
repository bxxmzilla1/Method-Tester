import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import geoip from "geoip-lite";
import crypto from "node:crypto";
import {
  createDbClient,
  runMigrations,
  isRemoteDatabase,
  insertLink,
  listLinksWithAnalytics,
  getLinkBySlug,
  insertVisit,
  isUniqueConstraintError,
} from "./server/db.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const useRemoteDb = isRemoteDatabase();

const upload = multer({
  storage: useRemoteDb
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
          const ext = path.extname(file.originalname);
          cb(null, file.fieldname + "-" + uniqueSuffix + ext);
        },
      }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export async function startServer() {
  const db = createDbClient();
  await runMigrations(db);

  const app = express();
  const PORT = 3000;

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (corsOrigin) {
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", corsOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
      next();
    });
  }

  app.use(express.json());
  app.use("/uploads", express.static(UPLOADS_DIR));

  app.post("/api/links", upload.single("screenshot"), async (req, res) => {
    try {
      const { slug, bio } = req.body;
      if (!slug) {
        return res.status(400).json({ error: "Slug is required" });
      }

      let screenshot_path: string | null = null;
      let screenshot_mime: string | null = null;
      let screenshot_base64: string | null = null;

      if (req.file) {
        if (useRemoteDb) {
          screenshot_mime = req.file.mimetype || "application/octet-stream";
          screenshot_base64 = req.file.buffer.toString("base64");
        } else {
          screenshot_path = `uploads/${req.file.filename}`;
        }
      }

      const id = crypto.randomUUID();
      await insertLink(db, {
        id,
        slug,
        bio: bio || "",
        screenshot_path,
        screenshot_mime,
        screenshot_base64,
      });

      res.status(201).json({
        id,
        slug,
        bio: bio || "",
        screenshot_path,
        screenshot_inline: !!screenshot_base64,
      });
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        return res.status(400).json({ error: "Slug already exists" });
      }
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/links", async (_req, res) => {
    try {
      const links = await listLinksWithAnalytics(db);
      res.json(
        links.map((l) => ({
          id: l.id,
          slug: l.slug,
          bio: l.bio ?? "",
          screenshot_path: l.screenshot_path,
          screenshot_inline: !!l.screenshot_base64,
          created_at: l.created_at,
          total_clicks: l.total_clicks,
          unique_clicks: l.unique_clicks,
          countries: l.countries,
        })),
      );
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/links/:slug/screenshot", async (req, res) => {
    try {
      const link = await getLinkBySlug(db, req.params.slug);
      if (!link?.screenshot_base64 || !link.screenshot_mime) {
        return res.status(404).end();
      }
      const buf = Buffer.from(link.screenshot_base64, "base64");
      res.setHeader("Content-Type", link.screenshot_mime);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(buf);
    } catch (e) {
      console.error(e);
      res.status(500).end();
    }
  });

  app.get("/:slug", async (req, res, next) => {
    const slug = req.params.slug;

    if (
      slug.startsWith("api") ||
      slug.startsWith("uploads") ||
      slug.startsWith("src") ||
      slug.startsWith("@") ||
      slug.startsWith("node_modules")
    ) {
      return next();
    }

    try {
      const link = await getLinkBySlug(db, slug);

      if (link) {
        let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
        if (Array.isArray(ip)) ip = ip[0];
        ip = (ip as string).split(",")[0].trim();

        const geo = geoip.lookup(ip);
        const country = geo ? geo.country : "Unknown";

        await insertVisit(db, slug, ip, country);

        const imgSrc = link.screenshot_base64
          ? `/api/links/${encodeURIComponent(link.slug)}/screenshot`
          : link.screenshot_path
            ? `/${link.screenshot_path}`
            : null;

        const bioHtml = link.bio
          ? `<p style="font-size: 1.1rem; color: #3f3f46; margin-bottom: 24px;">${escapeHtml(link.bio)}</p>`
          : "";

        const imgHtml = imgSrc
          ? `<img src="${imgSrc}" alt="Screenshot for ${escapeHtml(link.slug)}" />`
          : "<p>No screenshot available.</p>";

        res.send(`<!DOCTYPE html>
<html>
<head>
  <title>View Link</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui, sans-serif; background: #f4f4f5; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 800px; width: 100%; text-align: center; }
    img { max-width: 100%; height: auto; border-radius: 8px; margin-top: 16px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  </style>
</head>
<body>
  <div class="card">
    ${bioHtml}
    ${imgHtml}
  </div>
</body>
</html>`);
      } else {
        next();
      }
    } catch (e) {
      console.error(e);
      next();
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(
      useRemoteDb
        ? "Database: Turso (remote)"
        : "Database: local links.db file",
    );
  });
}

startServer();
