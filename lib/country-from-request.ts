import type { IncomingMessage } from "node:http";

/**
 * ISO 3166-1 alpha-2 country code from Vercel (no extra deps; geoip-lite breaks in serverless).
 * @see https://vercel.com/docs/headers/request-headers#x-vercel-ip-country
 */
export function countryFromProxiedRequest(req: IncomingMessage): string {
  const h = req.headers["x-vercel-ip-country"];
  if (typeof h === "string" && h.length >= 2) return h;
  return "";
}
