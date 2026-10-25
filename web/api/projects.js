// GET /api/projects: what sits in the display case (the projects table in Neon, see db/projects.sql), in order
import { neon } from "@neondatabase/serverless";

export async function GET() {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`select id, title, body, url, link_label, model from projects order by position, id limit 8`;
  // cached at Vercel's edge for a minute: an edit in the Neon console shows up soon after
  return Response.json(rows, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=86400" } });
}
