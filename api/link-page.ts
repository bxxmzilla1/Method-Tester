import type { VercelRequest, VercelResponse } from "@vercel/node";
import geoip from "geoip-lite";
import { getSupabaseServer } from "../lib/supabase-server";
import { renderLinkLandingHtml } from "../lib/link-service";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).end();
    return;
  }

  const slug = typeof req.query.slug === "string" ? req.query.slug : null;
  if (!slug) {
    res.status(400).send("Missing slug");
    return;
  }

  try {
    const supabase = getSupabaseServer();
    const { data: link, error } = await supabase
      .from("links")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error(error);
      res.status(500).send("Server error");
      return;
    }

    if (!link) {
      res.status(404).send("Link not found");
      return;
    }

    let ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "127.0.0.1";
    if (Array.isArray(ip)) ip = ip[0];
    ip = String(ip).split(",")[0].trim();

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
    res.status(200).send(renderLinkLandingHtml(link));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
}
