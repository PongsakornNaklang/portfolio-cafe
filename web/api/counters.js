// /api/counters: small tallies shared by every visitor (the counters table in Neon, see db/counters.sql)
// GET: { name: n } for every counter. POST { name }: add one to it, returns { n }.
import { neon } from "@neondatabase/serverless";
import { drinks } from "../content.js";

const NAMES = new Set(["cat", ...drinks.map((d) => `drink:${d.id}`),
  ...["easy", "hard"].flatMap((l) => ["win", "lose", "draw"].map((r) => `checkers:${l}:${r}`)),
  ...["easy", "hard"].flatMap((l) => ["win", "lose"].map((r) => `uyes:${l}:${r}`))]);

export async function GET() {
  const rows = await neon(process.env.DATABASE_URL)`select name, n from counters`;
  return Response.json(Object.fromEntries(rows.map((r) => [r.name, Number(r.n)])),
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=300" } });
}

// ponytail: no per-visitor limit, so a script could pump a counter; add the ip_hash throttle from board.js if that happens
export async function POST(request) {
  const { name } = await request.json().catch(() => ({}));
  if (!NAMES.has(name)) return Response.json({ error: "Unknown counter" }, { status: 400 });
  const [{ n }] = await neon(process.env.DATABASE_URL)`
    insert into counters (name, n) values (${name}, 1) on conflict (name) do update set n = counters.n + 1 returning n`;
  return Response.json({ n: Number(n) }, { headers: { "Cache-Control": "no-store" } });
}
