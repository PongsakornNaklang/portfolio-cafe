// Everything the speech-bubble cards say. Edit freely: keys match the `hotspot` values in the Blender scene.
// Write about the work; keep hobbies out of the copy (they live in the design instead).

export const site = {
  name: "Pongsakorn Naklang",
  musicUrl: "", // drop a royalty-free lofi track in web/ and put its file name here; empty = built-in synth loop
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
    body: "Software developer. (Write a two-line intro here: what you build and what you care about.)",
  },
  skills: {
    title: "Menu",
    // one row per item, like a coffee menu: [name, note]
    rows: [
      ["Your main language", "since 20XX"],
      ["Your framework", "daily"],
      ["Your tools", "favourite"],
    ],
  },
  hello: {
    title: "สวัสดี!",
    body: "Welcome to NAKANG. Click anything that looks interesting.",
  },
  "project:iport": {
    title: "iPort",
    body: "A web iPod: pick a song and click through a classic iPod interface in the browser.",
    link: { label: "Open iPort", url: "https://iport-pi.vercel.app/" },
  },
  contact: {
    title: "Contact",
    body: "Say hello or ask about a project.",
    links: [
      { label: "GitHub", url: "https://github.com/PongsakornNaklang" },
      { label: "Email", url: "mailto:pongsakornnaklang@gmail.com" },
    ],
  },
};
