import { config } from "dotenv";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import geoip from "geoip-lite";
import { getSupabaseServer } from "./lib/supabase-server";
import {
  buildLinksPayload,
  createLink,
  renderLinkLandingHtml,
  type UploadedFile,
} from "./lib/link-service";

config({ path: ".env" });
config({ path: ".env.local", override: true });

let supabase: ReturnType<typeof getSupabaseServer>;
try {
  supabase = getSupabaseServer();
} catch (e) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example and supabase/migrations/001_initial.sql).",
  );
  console.error(e);
  process.exit(1);
}

function sendCreateLinkError(res: express.Response, err: unknown) {
  const e = err as { statusCode?: number; message?: string };
  const status = typeof e.statusCode === "number" ? e.statusCode : 500;
  const body =
    status === 500
      ? { error: "Internal server error" }
      : { error: e.message || "Bad request" };
  res.status(status).json(body);
}

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

  app.use(express.json({ limit: "6mb" }));

  app.post("/api/links", async (req, res) => {
    try {
      const b = req.body as {
        slug?: string;
        bio?: string;
        screenshotBase64?: string;
        screenshotMime?: string;
      };
      let file: UploadedFile | null = null;
      if (b.screenshotBase64) {
        file = {
          buffer: Buffer.from(b.screenshotBase64, "base64"),
          mimetype: b.screenshotMime || "image/png",
          originalname: "upload.png",
        };
      }
      const data = await createLink(supabase, {
        slug: b.slug ?? "",
        bio: b.bio ?? "",
        file,
      });
      res.status(201).json(data);
    } catch (err) {
      sendCreateLinkError(res, err);
    }
  });

  app.get("/api/links", async (req, res) => {
    try {
      const payload = await buildLinksPayload(supabase);
      res.json(payload);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
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
      const { data: link, error } = await supabase
        .from("links")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        console.error(error);
        return next();
      }

      if (link) {
        let ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
        if (Array.isArray(ip)) ip = ip[0];
        ip = (ip as string).split(",")[0].trim();

        const geo = geoip.lookup(ip);
        const country = geo ? geo.country : "Unknown";

        const { error: visitErr } = await supabase.from("visits").insert({
          link_slug: slug,
          ip_address: ip,
          country,
        });

        if (visitErr) {
          console.error(visitErr);
        }

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(renderLinkLandingHtml(link));
        return;
      }

      next();
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
  });
}

startServer();
