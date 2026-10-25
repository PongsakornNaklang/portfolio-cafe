// POST /api/visits: count this visitor (once a day) and return { total } for the counter on the shopfront
// (the visits table in Neon, see db/visits.sql)
import { neon } from "@neondatabase/serverless";
import { createHmac } from "node:crypto";

export async function POST(request) {
  const day = new Date().toISOString().slice(0, 10); // UTC
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  const ipHash = createHmac("sha256", process.env.PGPASSWORD ?? "").update(`${day} ${ip}`).digest("hex");
  const sql = neon(process.env.DATABASE_URL);
  await sql`insert into visits (day, ip_hash) values (${day}, ${ipHash}) on conflict do nothing`;
  const [{ total }] = await sql`select count(*)::int as total from visits`;
  return Response.json({ total }, { headers: { "Cache-Control": "no-store" } });
}
