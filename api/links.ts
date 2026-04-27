import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseServer } from "../lib/supabase-server";
import {
  buildLinksPayload,
  createLink,
  type UploadedFile,
} from "../lib/link-service";
import { readJsonBodyForVercel } from "../lib/read-json-body";

function applyCors(res: VercelResponse) {
  const cors = process.env.CORS_ORIGIN?.trim();
  if (cors) {
    res.setHeader("Access-Control-Allow-Origin", cors);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
}

function sendError(
  res: VercelResponse,
  err: unknown,
  fallback = "Internal server error",
) {
  const e = err as { statusCode?: number; message?: string };
  const status = typeof e.statusCode === "number" ? e.statusCode : 500;
  const msg = status === 500 ? fallback : e.message || fallback;
  res.status(status).json({ error: msg });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const supabase = getSupabaseServer();

    if (req.method === "GET") {
      const payload = await buildLinksPayload(supabase);
      res.status(200).json(payload);
      return;
    }

    if (req.method === "POST") {
      let body: Record<string, unknown>;
      try {
        body = await readJsonBodyForVercel(req);
      } catch {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }

      const slug = String(body.slug ?? "");
      const bio = String(body.bio ?? "");
      let file: UploadedFile | null = null;

      const b64 = body.screenshotBase64;
      if (typeof b64 === "string" && b64.length > 0) {
        try {
          file = {
            buffer: Buffer.from(b64, "base64"),
            mimetype: String(body.screenshotMime || "image/png"),
            originalname: "upload.png",
          };
        } catch {
          res.status(400).json({ error: "Invalid screenshot data" });
          return;
        }
      }

      try {
        const data = await createLink(supabase, { slug, bio, file });
        res.status(201).json(data);
      } catch (err) {
        sendError(res, err);
      }
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}
