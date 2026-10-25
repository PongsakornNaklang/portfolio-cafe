// Everything the speech-bubble cards say. Edit freely: keys match the `hotspot` values in the Blender scene.
// Write about the work. Hobbies get one page in the portfolio book (cards.interests) and live in the design too.

export const site = {
  name: "Pongsakorn Naklang",
  // the records on the vinyl shelf (tap the shelf to flip through them). id: for requests (counters "request:<id>");
  // url "" = a loop made in the browser, synth: its tempo, chords (MIDI notes) and tone; cover: the sleeve's colours;
  // say: what Bankza says when it goes on; secret: only in the crate at night ("night") or once you've found 8 eggs
  records: [
    { id: "lofi1", name: "Lofi Loop", by: "omfgdude", url: "sfx/lofi1.mp3", cover: ["#f2a65a", "#3d405b"],
      say: ["Ooh, this one. Good for sipping slowly.", "My favourite for closing up the shop."] },
    { id: "lofi2", name: "Lofi Again", by: "omfgdude", url: "sfx/lofi2.mp3", cover: ["#81b29a", "#f4f1de"],
      say: ["Lofi Again! Can't get enough of it.", "This one's for rainy Bangkok afternoons."] },
    { id: "tape", name: "Shop tape", by: "made in the browser", url: "", cover: ["#ffe100", "#2b2420"],
      say: ["I made this one myself. Be nice.", "Home-made beats, like the coffee."] },
    { id: "citypop", name: "Neon Expressway", by: "city pop, made in the browser", url: "", cover: ["#ff7eb6", "#1b1b3a"],
      synth: { bpm: 104, cutoff: 3200, chords: [[53, 57, 60, 64], [52, 56, 59, 62], [57, 60, 64, 67], [55, 58, 62, 65]], // Fmaj7 E7 Am7 Gm7
        bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b, i) => [b, 0, i % 2 ? 0 : -1, 0.45]), bassWave: "triangle",
        kick: [0, 1, 2, 3], tick: [], snare: [1, 3], hats: 2, leadWave: "square", vibrato: 8,
        lead: "72 - 74 72 69 - 67 69  68 - 71 - 74 - 71 68  69 - 72 - 76 74 72 -  70 - 69 67 65 - . ." },
      say: ["City pop! Like driving at night with the windows down.", "Bangkok by night, Tokyo in my head."] },
    { id: "rnb", name: "Slow Jam Sunday", by: "R&B, made in the browser", url: "", cover: ["#5b2a86", "#f7b801"],
      synth: { bpm: 70, cutoff: 1700, chords: [[48, 51, 55, 58], [56, 60, 63, 67], [53, 56, 60, 63], [55, 59, 62, 65]], // Cm7 Abmaj7 Fm7 G7
        bass: [[0, 0, -1, 1.5], [1.75, 0, -1, 0.25], [2.5, 1, -1, 1], [3.5, 0, -1, 0.5]],
        kick: [0, 1.75, 2.5], tick: [], snare: [1, 3], hats: 4, swing: 0.3, leadWave: "triangle", vibrato: 15,
        lead: ". . 67 - 70 - 72 -  75 - - 72 70 - . .  . . 68 - 67 - 65 63  74 - - 71 - - . ." },
      say: ["Smooth. Like the milk on a good latte.", "R&B on a slow Sunday. Can't beat it."] },
    { id: "lukthung", name: "Rice Field Radio", by: "ลูกทุ่ง, made in the browser", url: "", cover: ["#2a9d8f", "#ffe66d"],
      synth: { bpm: 120, cutoff: 2600, chords: [[48, 52, 55, 60], [53, 57, 60, 65], [55, 59, 62, 67], [48, 52, 55, 60]], // C F G C
        bass: [[0, 0, -1, 0.5], [1, 2, -1, 0.5], [2, 0, -1, 0.5], [3, 2, -1, 0.5]], // oom-pah: the root, then the fifth
        kick: [0, 2], tick: [1, 3], ching: [0.5, 1.5, 2.5, 3.5], leadWave: "sawtooth", vibrato: 25, // a khaen-ish reedy tune
        lead: "72 74 76 - 74 72 69 72  69 - 72 69 67 - 64 67  67 69 72 74 76 - 74 72  69 67 64 - 60 - . ." },
      say: ["Luk thung! My mum's favourite.", "My feet tap to this one, can't help it."] },
    { id: "night", name: "Night Tape", by: "made in the browser", url: "", secret: "night", cover: ["#22223b", "#c9ada7"],
      synth: { bpm: 62, chords: [[50, 53, 57, 60], [46, 50, 53, 57], [48, 51, 55, 58], [43, 46, 50, 53]], cutoff: 900 },
      say: ["Only comes out after dark, this one. Shh.", "Night shift music. You found it."] },
    { id: "mixtape", name: "Bankza's Mixtape", by: "Bankza", url: "", secret: "eggs", cover: ["#e63946", "#a8dadc"],
      synth: { bpm: 88, chords: [[55, 59, 62, 66], [52, 55, 59, 62], [48, 52, 55, 59], [50, 54, 57, 60]], cutoff: 1800 },
      say: ["My mixtape! Only regulars get to hear this.", "You've found so much here. This one's for you."] },
  ],
};

// drinks you can order from the character (ids match TPL_drink_* in the 3D scene)
// steps: how he makes it, one step every 1.4 s: [the sound (grind, shot, ice, pour, whisk), what he says]
export const drinks = [
  { id: "latte", name: "Iced latte", emoji: "🧋",
    steps: [["grind", "Grinding the beans…"], ["shot", "Pulling a shot…"], ["ice", "Ice in…"], ["pour", "Milk on top…"]] },
  { id: "matcha", name: "Matcha latte", emoji: "🍵",
    steps: [["whisk", "Whisking the matcha…"], ["ice", "Ice in…"], ["pour", "Milk on top…"]] },
  { id: "thaitea", name: "Thai tea", emoji: "🧡",
    steps: [["pour", "Pulling the tea…"], ["ice", "Ice in…"], ["pour", "Condensed milk…"]] },
  { id: "espresso", name: "Espresso", emoji: "☕",
    steps: [["grind", "Grinding the beans…"], ["shot", "Pulling a shot…"]] },
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
  // projects in the display case come from the database (db/projects.sql); this one is only in the book
  "project:nakang": {
    title: "NAKANG",
    body: "This shop. A Bangkok street corner you can walk up to, sit in and tap around: modelled in Blender with Meshy models, built with three.js, coded with Claude Code.",
  },
  // the "off the clock" page of the portfolio book: just the topics
  interests: {
    title: "Off the clock",
    rows: [["Old tech & gadgets", ""], ["Graphics", ""], ["Custom keyboards", ""], ["Mid-century home", ""], ["Indoor plants", ""], ["Music", ""], ["Making my own games", ""]],
  },
  // the tip jar on the counter; its QRs and Ko-fi link come from the database (db/settings.sql)
  tip: {
    title: "Tip me a coffee ☕",
    body: "Enjoyed your visit? Pick a way to tip.",
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
