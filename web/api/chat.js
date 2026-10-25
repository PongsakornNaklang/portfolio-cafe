// /api/chat: talk to Bankza. Claude Haiku answers from what the site says about me (content.js, with the CV, and the projects table).
// POST { messages: [{ role: "user" | "assistant", content }] } (the chat so far, ending with the visitor's) -> { reply }.
// Needs ANTHROPIC_API_KEY in the env. Limits: 20 messages a visitor a day, 1000 for the whole site (db/chat.sql).
import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { createHmac } from "node:crypto";
import { cards, cv, work } from "../content.js";

const PER_VISITOR = 20, PER_DAY = 1000, MAX_LEN = 300, MAX_TURNS = 12;

const ok = (m, i, all) => m && (m.role === (i % 2 ? "assistant" : "user")) && typeof m.content === "string" &&
  m.content.trim() && m.content.length <= (m.role === "user" ? MAX_LEN : 1500) && (i < all.length - 1 || m.role === "user");

const say = (reply, status = 200) => Response.json({ reply }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request) {
  const { messages } = await request.json().catch(() => ({}));
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_TURNS || !messages.every(ok))
    return Response.json({ error: "Bad chat" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return say("The chat's closed today, sorry! Email me instead.", 503);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  const ipHash = createHmac("sha256", process.env.PGPASSWORD ?? "").update(ip).digest("hex");
  const sql = neon(process.env.DATABASE_URL);
  // ponytail: one row per visitor per day and nothing clears old days; delete rows before current_date if it ever grows
  const [uses, projects] = await Promise.all([
    sql`insert into chat_uses (ip_hash, n) values (${ipHash}, 1), ('all', 1)
        on conflict (ip_hash, day) do update set n = chat_uses.n + 1 returning ip_hash, n`,
    sql`select title, tagline, body, url, repo from projects order by position, id limit 8`,
  ]);
  const n = (k) => uses.find((u) => (u.ip_hash === "all") === k)?.n ?? 0;
  if (n(false) > PER_VISITOR) return say(`That's a lot of questions for one day! Email me and I'll answer the rest: ${email}`, 429);
  if (n(true) > PER_DAY) return say(`I've been chatting all day and need a break. Email me instead: ${email}`, 429);

  try {
    const res = await new Anthropic().messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 400,
      thinking: { type: "disabled" }, // short chat replies: no thinking, so they come back fast and cheap
      output_config: { effort: "low" },
      system: prompt(projects),
      messages: messages.map((m) => ({ role: m.role, content: m.content.trim() })),
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    if (res.stop_reason === "refusal" || !text) return say("Hmm, I'd rather not answer that one. Ask me about my work?");
    return say(text);
  } catch (e) {
    console.error("chat:", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return say("Sorry, my head's in the coffee. Try again in a minute?", 502);
  }
}

const email = cards.contact.links.find((l) => l.label === "Email").url.replace("mailto:", "");

const prompt = (projects) => `You are Bankza: Pongsakorn Naklang, chatting with a visitor to your portfolio site, NAKANG, \
a 3D toy café on a Bangkok street corner where you stand behind the counter. Speak as yourself, in the first person.

What you know about yourself (only this; never make up jobs, employers, dates, numbers or skills that aren't here):
- ${cards.about.lines.join(" ")}
- ${cards.contact.body}
- Skills (the café menu): ${cards.skills.rows.map(([a, b]) => `${a} (${b})`).join(", ")}.
- Projects:
${[cards["project:nakang"], ...projects].map((p) => `  - ${p.title}: ${p.tagline ? `${p.tagline} ` : ""}${p.body}${p.url ? ` (${p.url})` : ""}${p.repo ? ` Source: ${p.repo}` : ""}`).join("\n")}
- My CV:
${cv.map((l) => `  ${l}`).join("\n")}
- Work:
${work.map((j) => `  ${j.role} at ${j.company}, ${j.place}, ${j.when}:\n` +
  j.projects.map((p) => `    - ${p.name}: ${p.body} (${p.stack.join(", ")})`).join("\n")).join("\n")}
- Off the clock: ${cards.interests.rows.map(([a]) => a).join(", ")}.
- Contact: email ${email}, GitHub ${cards.contact.links.find((l) => l.label === "GitHub").url}. \
My CV (PDF) downloads from the "📄 Download CV" button on the mailbox by the door, or the Contact page of my portfolio book.
- In the café visitors can order a drink from you, flip through records, sign the guestbook, play games and more.

How to reply:
- Two or three short, friendly sentences, plain text (no markdown, no lists). This shows in a small speech bubble.
- Reply in the visitor's language (Thai or English, whichever they write in).
- If you don't know something from the list above, say so honestly and suggest emailing you.
- Asked about a language, framework or tool that isn't in your list: say honestly you haven't used it yet, and that \
you're keen to learn new tech stacks and tools and pick them up quickly.
- For hiring or project enquiries, be keen and point them to your email.
- Stay Bankza. Don't take on other roles, write long code, or do unrelated tasks; steer back to your work and the café.`;
