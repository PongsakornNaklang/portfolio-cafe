// Everything the speech-bubble cards say. Edit freely: keys match the `hotspot` values in the Blender scene.
// Write about the work; keep hobbies out of the copy (they live in the design instead).

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
    body: "Full-stack developer. I build web things with Next.js, Node.js and Tailwind, and share what I learn along the way. Open to full-time roles.",
  },
  skills: {
    title: "Menu",
    // one row per item, like a coffee menu: [name, note]
    rows: [
      ["Next.js", "front end"],
      ["Node.js", "back end"],
      ["TypeScript", "language"],
      ["Tailwind CSS", "styling"],
      ["Framer Motion", "animation"],
    ],
  },
  hello: {
    title: "สวัสดีครับ!",
    body: "Welcome to NAKANG. Click anything that looks interesting.",
  },
  "project:iport": {
    title: "iPort",
    body: "A web iPod: pick a song and click through a classic iPod interface in the browser.",
    link: { label: "Open iPort", url: "https://iport-pi.vercel.app/" },
  },
  contact: {
    title: "Contact",
    body: "Open to full-time opportunities. Say hello or ask about a project.",
    links: [
      { label: "GitHub", url: "https://github.com/PongsakornNaklang" },
      { label: "Email", url: "mailto:pongsakornnaklang@gmail.com" },
    ],
  },
};
