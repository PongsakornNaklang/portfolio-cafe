// /api/tips: tips from Ko-fi (the tips table in Neon, see db/tips.sql)
// GET: { count, latest: { name, message } | null } for the tip jar. POST: Ko-fi's webhook (Ko-fi > Settings > API >
// Webhook URL = https://<site>/api/tips), checked against its verification token in the KOFI_VERIFICATION_TOKEN env var.
import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";

export async function GET() {
  const sql = neon(process.env.DATABASE_URL);
  const [{ count }] = await sql`select count(*)::int as count from tips`;
  const [latest] = await sql`select name, message from tips where name is not null order by created_at desc limit 1`;
  return Response.json({ count, latest: latest ?? null }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=30" } });
}

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request) {
  // Ko-fi posts a form with one field, data: the payment as JSON
  const raw = await request.formData().then((f) => f.get("data")).catch(() => null);
  let d;
  try { d = JSON.parse(raw); } catch { return Response.json({ error: "Bad payload" }, { status: 400 }); }
  const token = process.env.KOFI_VERIFICATION_TOKEN ?? "";
  if (!token || typeof d?.verification_token !== "string" || !same(d.verification_token, token))
    return Response.json({ error: "Not from Ko-fi" }, { status: 401 });
  if (typeof d.kofi_transaction_id !== "string" || !d.kofi_transaction_id) return Response.json({ error: "No transaction id" }, { status: 400 });
  const pub = d.is_public === true;
  const name = pub && typeof d.from_name === "string" ? d.from_name.trim().slice(0, 40) || null : null;
  const message = pub && typeof d.message === "string" ? d.message.trim().slice(0, 200) || null : null;
  const amount = Number.isFinite(Number(d.amount)) ? Number(d.amount) : null;
  await neon(process.env.DATABASE_URL)`
    insert into tips (id, type, name, message, amount, currency)
    values (${d.kofi_transaction_id}, ${String(d.type ?? "Donation").slice(0, 30)}, ${name}, ${message}, ${amount}, ${String(d.currency ?? "").slice(0, 8) || null})
    on conflict (id) do nothing`;
  return Response.json({ ok: true }); // Ko-fi retries anything but a 200
}
