// GET /api/settings: the site settings (the settings table in Neon, see db/settings.sql) as { key: value }
import { neon } from "@neondatabase/serverless";

export async function GET() {
  const rows = await neon(process.env.DATABASE_URL)`select key, value from settings`;
  // a minute at Vercel's edge, no stale-while-revalidate: that would hand the first visitor after a quiet spell an old value
  return Response.json(Object.fromEntries(rows.map((r) => [r.key, r.value])),
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } });
}
