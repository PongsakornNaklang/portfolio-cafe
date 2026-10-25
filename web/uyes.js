// UYES: the colour-and-number card game, you against Bankza. The rules and how he plays; the box, the cards and the
// table are in main.js.
// 108 cards: in each colour one 0 and two each of 1-9, Skip, Reverse and +2; then four Wilds and four Wild +4s.
// With two players Skip and Reverse both mean you go again; +2 and +4 make the other one draw and miss their go.
// No stacking a +2 on a +2.
export const COLORS = ["red", "yellow", "green", "blue"];
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function newDeck() {
  const d = [];
  for (const c of COLORS) {
    d.push({ c, v: 0 });
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, "skip", "reverse", "+2"]) d.push({ c, v }, { c, v });
  }
  for (let i = 0; i < 4; i++) d.push({ c: null, v: "wild" }, { c: null, v: "+4" });
  return shuffle(d);
}
export const canPlay = (card, top, color) => card.c === null || card.c === color || card.v === top.v;
export const goesAgain = (card) => ["skip", "reverse", "+2", "+4"].includes(card.v);
export const penalty = (card) => (card.v === "+2" ? 2 : card.v === "+4" ? 4 : 0);
// the colour he holds most of (for a Wild), any when he holds none
export function botColor(hand) {
  const n = COLORS.map((c) => hand.filter((h) => h.c === c).length), most = Math.max(...n);
  return most ? COLORS[n.indexOf(most)] : COLORS[Math.floor(Math.random() * 4)];
}
// his card: an index into his hand, or -1 to draw. Easy: any card that fits. Hard: while you hold plenty, numbers
// in the colour he has most of, saving the action cards and Wilds; once you're down to two cards or fewer, the
// +4s and +2s first, then Skips
export function botPick(hand, top, color, level, yours) {
  const ok = hand.map((_, i) => i).filter((i) => canPlay(hand[i], top, color));
  if (!ok.length) return -1;
  if (level === "easy") return ok[Math.floor(Math.random() * ok.length)];
  const held = (c) => hand.filter((h) => h.c === c.c).length;
  const rank = (c) => yours <= 2 ? (penalty(c) ? 0 : goesAgain(c) ? 1 : c.c === null ? 3 : 2)
    : c.v === "+4" ? 4 : c.c === null ? 3 : goesAgain(c) ? 2 : 1;
  return ok.sort((a, b) => rank(hand[a]) - rank(hand[b]) || held(hand[b]) - held(hand[a]))[0];
}
