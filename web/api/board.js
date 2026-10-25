// /api/board: the guestbook board everyone shares (the guestbook table in Neon, see db/guestbook.sql)
// GET: the newest picture, or null. POST { image: data URL }: put up a new one.
import { neon } from "@neondatabase/serverless";
import { createHmac } from "node:crypto";

const MAX_BYTES = 1_500_000; // a 900 x 600 board is well under this, even PNG
const KINDS = { png: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  webp: (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP" };

export async function GET() {
  const [row] = await neon(process.env.DATABASE_URL)`select image, created_at from guestbook order by id desc limit 1`;
  return Response.json(row ?? null, { headers: { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=60" } });
}

export async function POST(request) {
  const { image } = await request.json().catch(() => ({}));
  const m = typeof image === "string" && /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(image);
  const bytes = m && Buffer.from(m[2], "base64");
  if (!m || bytes.length > MAX_BYTES || !KINDS[m[1]](bytes)) return Response.json({ error: "Not a board picture" }, { status: 400 });
  // one save per visitor every 15 s; the IP is only kept as a keyed hash
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  const ipHash = createHmac("sha256", process.env.PGPASSWORD ?? "").update(ip).digest("hex");
  const sql = neon(process.env.DATABASE_URL);
  const [recent] = await sql`select 1 from guestbook where ip_hash = ${ipHash} and created_at > now() - interval '15 seconds' limit 1`;
  if (recent) return Response.json({ error: "Wait a few seconds, then try again" }, { status: 429 });
  await sql`insert into guestbook (image, ip_hash) values (${image}, ${ipHash})`;
  await sql`delete from guestbook where id < (select min(id) from (select id from guestbook order by id desc limit 50) keep)`;
  return Response.json({ ok: true }, { status: 201 });
}
