import { createClient, LibsqlError, type Client } from "@libsql/client";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function isRemoteDatabase(): boolean {
  return !!(
    process.env.TURSO_DATABASE_URL?.trim() &&
    process.env.TURSO_AUTH_TOKEN?.trim()
  );
}

export function createDbClient(): Client {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (tursoUrl && tursoToken) {
    return createClient({ url: tursoUrl, authToken: tursoToken });
  }
  const dbPath = path.join(process.cwd(), "links.db");
  return createClient({ url: pathToFileURL(dbPath).href });
}

export async function runMigrations(client: Client): Promise<void> {
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS links (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        target_url TEXT,
        screenshot_path TEXT,
        bio TEXT,
        screenshot_mime TEXT,
        screenshot_base64 TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_slug TEXT NOT NULL,
        ip_address TEXT,
        country TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_visits_link_slug ON visits(link_slug)`,
    ],
    "write",
  );

  for (const sql of [
    "ALTER TABLE links ADD COLUMN bio TEXT",
    "ALTER TABLE links ADD COLUMN screenshot_mime TEXT",
    "ALTER TABLE links ADD COLUMN screenshot_base64 TEXT",
  ]) {
    try {
      await client.execute(sql);
    } catch {
      /* column exists */
    }
  }
}

export function isUniqueConstraintError(err: unknown): boolean {
  if (err instanceof LibsqlError) {
    return (
      err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      err.extendedCode === "SQLITE_CONSTRAINT_UNIQUE" ||
      (err.code === "SQLITE_CONSTRAINT" &&
        (err.message.includes("UNIQUE") || err.message.includes("unique")))
    );
  }
  return err instanceof Error && /unique/i.test(err.message);
}

export interface LinkRow {
  id: string;
  slug: string;
  bio: string | null;
  screenshot_path: string | null;
  screenshot_mime: string | null;
  screenshot_base64: string | null;
  created_at: string;
  total_clicks: number;
  unique_clicks: number;
  countries: { country: string; count: number }[];
}

export async function insertLink(
  client: Client,
  params: {
    id: string;
    slug: string;
    bio: string;
    screenshot_path: string | null;
    screenshot_mime: string | null;
    screenshot_base64: string | null;
  },
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO links (id, slug, bio, screenshot_path, screenshot_mime, screenshot_base64)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      params.id,
      params.slug,
      params.bio,
      params.screenshot_path,
      params.screenshot_mime,
      params.screenshot_base64,
    ],
  });
}

export async function listLinksWithAnalytics(client: Client): Promise<LinkRow[]> {
  const listRs = await client.execute(`
    SELECT
      l.id, l.slug, l.bio, l.screenshot_path, l.screenshot_mime, l.screenshot_base64, l.created_at,
      COUNT(v.id) AS total_clicks,
      COUNT(DISTINCT v.ip_address) AS unique_clicks
    FROM links l
    LEFT JOIN visits v ON l.slug = v.link_slug
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `);

  const links: LinkRow[] = [];
  for (const row of listRs.rows) {
    const slug = row.slug as string;
    const countryRs = await client.execute({
      sql: `SELECT country, COUNT(*) AS count
            FROM visits WHERE link_slug = ?
            GROUP BY country ORDER BY count DESC`,
      args: [slug],
    });
    const countries = countryRs.rows.map((r) => ({
      country: String(r.country ?? "Unknown"),
      count: Number(r.count ?? 0),
    }));
    links.push({
      id: String(row.id),
      slug,
      bio: row.bio != null ? String(row.bio) : null,
      screenshot_path:
        row.screenshot_path != null ? String(row.screenshot_path) : null,
      screenshot_mime:
        row.screenshot_mime != null ? String(row.screenshot_mime) : null,
      screenshot_base64:
        row.screenshot_base64 != null ? String(row.screenshot_base64) : null,
      created_at: String(row.created_at),
      total_clicks: Number(row.total_clicks ?? 0),
      unique_clicks: Number(row.unique_clicks ?? 0),
      countries,
    });
  }
  return links;
}

export async function getLinkBySlug(
  client: Client,
  slug: string,
): Promise<LinkRow | null> {
  const rs = await client.execute({
    sql: `SELECT id, slug, bio, screenshot_path, screenshot_mime, screenshot_base64, created_at
          FROM links WHERE slug = ?`,
    args: [slug],
  });
  const row = rs.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    slug: String(row.slug),
    bio: row.bio != null ? String(row.bio) : null,
    screenshot_path:
      row.screenshot_path != null ? String(row.screenshot_path) : null,
    screenshot_mime:
      row.screenshot_mime != null ? String(row.screenshot_mime) : null,
    screenshot_base64:
      row.screenshot_base64 != null ? String(row.screenshot_base64) : null,
    created_at: String(row.created_at),
    total_clicks: 0,
    unique_clicks: 0,
    countries: [],
  };
}

export async function insertVisit(
  client: Client,
  slug: string,
  ip: string,
  country: string,
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO visits (link_slug, ip_address, country) VALUES (?, ?, ?)`,
    args: [slug, ip, country],
  });
}
