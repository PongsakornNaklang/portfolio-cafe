// GET /api/lines: what Bankza says on his own (the lines table in Neon, see db/lines.sql)
import { neon } from "@neondatabase/serverless";

export async function GET() {
  const rows = await neon(process.env.DATABASE_URL)`select id, spot, text, egg, pose, target from lines`;
  // a minute at Vercel's edge, no stale-while-revalidate: that would hand the first visitor after a quiet spell old lines
  return Response.json(rows, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } });
}
