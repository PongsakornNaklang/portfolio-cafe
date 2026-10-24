// Everything the speech-bubble cards say. Edit freely: keys match the `hotspot` values in the Blender scene.
// Write about the work. Hobbies get one page in the portfolio book (cards.interests) and live in the design too.

export const site = {
  name: "Pongsakorn Naklang",
  // the records on the vinyl shelf (tap the shelf to pick one); url "" = the built-in synth loop
  records: [
    { name: "Lofi Loop", by: "omfgdude", url: "sfx/lofi1.mp3" },
    { name: "Lofi Again", by: "omfgdude", url: "sfx/lofi2.mp3" },
    { name: "Shop tape", by: "made in the browser", url: "" },
  ],
};

// drinks you can order from the character (ids match TPL_drink_* in the 3D scene)
export const drinks = [
  { id: "latte", name: "Iced latte", emoji: "🧋" },
  { id: "matcha", name: "Matcha latte", emoji: "🍵" },
  { id: "thaitea", name: "Thai tea", emoji: "🧡" },
  { id: "espresso", name: "Espresso", emoji: "☕" },
];

export const cards = {
  about: {
    title: "Pongsakorn Naklang",
    // the bubble says these one at a time, then one sign-off; the portfolio book prints them all as one paragraph
    lines: [
      "Hi, I'm Pongsakorn, but you can call me Bankza.",
      "I'm a software developer who builds web apps and AI tools.",
      "Lately I've been trying my hand at making games.",
      "I'm open to full-time roles.",
    ],
    signoffs: ["Nice to see you!", "Have a good day!", "Thanks for stopping by!", "Enjoy your coffee!", "Come back soon!"],
  },
  skills: {
    title: "Menu",
    // one row per item, like a coffee menu: [name, note]
    rows: [
      ["Next.js + React", "front end"],
      ["Node.js", "back end"],
      ["TypeScript", "language"],
      ["Tailwind CSS", "styling"],
      ["Three.js + Blender", "3D on the web"],
      ["Claude Code", "AI pair programming"],
      ["Meshy", "AI 3D models"],
    ],
  },
  hello: {
    title: "สวัสดีครับ!",
    body: "Welcome to NAKANG. Tap anything that catches your eye.",
  },
  "project:iport": {
    title: "iPort",
    body: "A web iPod: pick a song and click through a classic iPod interface in the browser.",
    link: { label: "Open iPort", url: "https://iport-pi.vercel.app/" },
  },
  "project:nakang": {
    title: "NAKANG",
    body: "This shop. A Bangkok street corner you can walk up to, sit in and tap around: modelled in Blender with Meshy models, built with three.js, coded with Claude Code.",
  },
  // the "off the clock" page of the portfolio book: just the topics
  interests: {
    title: "Off the clock",
    rows: [["Old tech & gadgets", ""], ["Graphics", ""], ["Custom keyboards", ""], ["Mid-century home", ""], ["Indoor plants", ""], ["Music", ""], ["Making my own games", ""]],
  },
  contact: {
    title: "Contact",
    body: "Looking for a full-time role. Have a project in mind, or just want to say hi? Get in touch.",
    links: [
      { label: "GitHub", url: "https://github.com/PongsakornNaklang" },
      { label: "Email", url: "mailto:pongsakornnaklang@gmail.com" },
    ],
  },
};
