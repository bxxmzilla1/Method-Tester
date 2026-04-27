import type { IncomingMessage } from "node:http";
import type { VercelRequest } from "@vercel/node";

const DEFAULT_LIMIT = 6 * 1024 * 1024;

function readRequestBody(req: IncomingMessage, limit = DEFAULT_LIMIT): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let len = 0;
    req.on("data", (c: Buffer) => {
      len += c.length;
      if (len > limit) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Vercel may pre-parse JSON into `req.body`; otherwise read the raw stream. */
export async function readJsonBodyForVercel(
  req: VercelRequest,
): Promise<Record<string, unknown>> {
  const anyReq = req as VercelRequest & { body?: unknown };
  if (
    anyReq.body != null &&
    typeof anyReq.body === "object" &&
    !Buffer.isBuffer(anyReq.body)
  ) {
    return anyReq.body as Record<string, unknown>;
  }

  const raw = await readRequestBody(req);
  if (!raw.trim()) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}
