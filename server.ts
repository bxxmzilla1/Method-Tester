import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { DatabaseSync } from "node:sqlite";
import geoip from "geoip-lite";
import crypto from "node:crypto";

const database = new DatabaseSync("links.db");

database.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE,
    target_url TEXT,
    screenshot_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_slug TEXT,
    ip_address TEXT,
    country TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  database.exec("ALTER TABLE links ADD COLUMN bio TEXT;");
} catch (e) {
  // column might already exist
}

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});
const upload = multer({ storage });

export async function startServer() {
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

  // --- API Routes ---
  app.post("/api/links", upload.single("screenshot"), (req, res) => {
    try {
      const { slug, bio } = req.body;
      const screenshot_path = req.file ? `uploads/${req.file.filename}` : null;

      if (!slug) {
        return res.status(400).json({ error: "Slug is required" });
      }

      const id = crypto.randomUUID();

      const stmt = database.prepare(
        "INSERT INTO links (id, slug, bio, screenshot_path) VALUES (?, ?, ?, ?)"
      );
      stmt.run(id, slug, bio || "", screenshot_path || "");

      res.status(201).json({ id, slug, bio, screenshot_path });
    } catch (err: any) {
      if (err.message.includes("UNIQUE constraint failed")) {
        return res.status(400).json({ error: "Slug already exists" });
      }
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/links", (req, res) => {
    try {
      const stmt = database.prepare(`
        SELECT
          l.id, l.slug, l.bio, l.screenshot_path, l.created_at,
          COUNT(v.id) as total_clicks,
          COUNT(DISTINCT v.ip_address) as unique_clicks
        FROM links l
        LEFT JOIN visits v ON l.slug = v.link_slug
        GROUP BY l.id
        ORDER BY l.created_at DESC
      `);
      const links = stmt.all();

      // For each link, fetch country breakdown
      for (let link of links as any[]) {
        const countryStmt = database.prepare(`
          SELECT country, COUNT(*) as count
          FROM visits
          WHERE link_slug = ?
          GROUP BY country
          ORDER BY count DESC
        `);
        link.countries = countryStmt.all(link.slug);
      }

      res.json(links);
    } catch (error) {
       console.error(error);
       res.status(500).json({ error: "Internal server error" });
    }
  });

  // Dynamic Slug Route (resolves /example)
  app.get("/:slug", (req, res, next) => {
    const slug = req.params.slug;

    // Skip known reserved paths used by Vite / backend
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
      const stmt = database.prepare("SELECT * FROM links WHERE slug = ?");
      const link = stmt.get(slug) as any;

      if (link) {
        let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
        if (Array.isArray(ip)) ip = ip[0];
        ip = (ip as string).split(",")[0].trim();

        const geo = geoip.lookup(ip);
        const country = geo ? geo.country : "Unknown";

        const insertStmt = database.prepare(
          "INSERT INTO visits (link_slug, ip_address, country) VALUES (?, ?, ?)"
        );
        insertStmt.run(slug, ip, country);

        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>View Link</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: system-ui, sans-serif; background: #f4f4f5; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
              .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 800px; width: 100%; text-align: center; }
              img { max-width: 100%; height: auto; border-radius: 8px; margin-top: 16px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
              a.btn { display: inline-block; background: #18181b; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 16px; transition: background 0.2s; }
              a.btn:hover { background: #27272a; }
            </style>
          </head>
          <body>
            <div class="card">
              ${
                link.bio 
                 ? `<p style="font-size: 1.1rem; color: #3f3f46; margin-bottom: 24px;">${link.bio}</p>` 
                 : ""
              }
              ${
                link.screenshot_path
                  ? `<img src="/${link.screenshot_path}" alt="Screenshot for ${link.slug}" />`
                  : "<p>No screenshot available.</p>"
              }
            </div>
          </body>
          </html>
        `);
      } else {
        next();
      }
    } catch (e) {
      console.error(e);
      next();
    }
  });

  // Vite middleware for development
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
  });
}

startServer();
