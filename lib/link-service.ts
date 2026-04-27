import path from "node:path";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "./supabase-server";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function buildLinksPayload(supabase: SupabaseClient) {
  const { data: links, error: linksError } = await supabase
    .from("links")
    .select("id, slug, bio, screenshot_path, created_at")
    .order("created_at", { ascending: false });

  if (linksError) throw linksError;

  const { data: visits, error: visitsError } = await supabase
    .from("visits")
    .select("link_slug, ip_address, country");

  if (visitsError) throw visitsError;

  type Stats = {
    total: number;
    uniqueIps: Set<string>;
    countryCount: Map<string, number>;
  };
  const slugToStats = new Map<string, Stats>();

  for (const v of visits ?? []) {
    if (!slugToStats.has(v.link_slug)) {
      slugToStats.set(v.link_slug, {
        total: 0,
        uniqueIps: new Set(),
        countryCount: new Map(),
      });
    }
    const s = slugToStats.get(v.link_slug)!;
    s.total += 1;
    if (v.ip_address) s.uniqueIps.add(v.ip_address);
    const c = v.country || "Unknown";
    s.countryCount.set(c, (s.countryCount.get(c) ?? 0) + 1);
  }

  return (links ?? []).map((l) => {
    const s = slugToStats.get(l.slug);
    const countries = s
      ? [...s.countryCount.entries()]
          .map(([country, count]) => ({ country, count }))
          .sort((a, b) => b.count - a.count)
      : [];
    return {
      ...l,
      total_clicks: s?.total ?? 0,
      unique_clicks: s?.uniqueIps.size ?? 0,
      countries,
    };
  });
}

export function renderLinkLandingHtml(link: {
  bio: string;
  screenshot_path: string | null;
  slug: string;
}): string {
  const bioHtml = link.bio
    ? `<p style="font-size: 1.1rem; color: #3f3f46; margin-bottom: 24px;">${escapeHtml(link.bio)}</p>`
    : "";

  const imgHtml = link.screenshot_path
    ? `<img src="${escapeHtml(link.screenshot_path)}" alt="Screenshot for ${escapeHtml(link.slug)}" />`
    : "<p>No screenshot available.</p>";

  return `<!DOCTYPE html>
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
</html>`;
}

export type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

export async function createLink(
  supabase: SupabaseClient,
  opts: {
    slug: string;
    bio: string;
    file?: UploadedFile | null;
  },
) {
  const { slug, bio, file } = opts;

  if (!slug) {
    throw Object.assign(new Error("Slug is required"), { statusCode: 400 });
  }

  let screenshotPublicUrl: string | null = null;

  if (file?.buffer?.length) {
    const ext = path.extname(file.originalname) || ".png";
    const objectPath = `${crypto.randomUUID()}${ext}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype || "application/octet-stream",
        upsert: false,
      });

    if (upErr) {
      console.error(upErr);
      throw Object.assign(new Error("Failed to upload screenshot"), {
        statusCode: 500,
      });
    }

    const { data: pub } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(objectPath);
    screenshotPublicUrl = pub.publicUrl;
  }

  const { data, error } = await supabase
    .from("links")
    .insert({
      slug,
      bio: bio || "",
      screenshot_path: screenshotPublicUrl,
    })
    .select("id, slug, bio, screenshot_path")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error("Slug already exists"), {
        statusCode: 400,
        code: "23505",
      });
    }
    console.error(error);
    throw Object.assign(new Error("Internal server error"), { statusCode: 500 });
  }

  return data;
}
