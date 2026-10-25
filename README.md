# NAKANG

A portfolio built as a tiny 3D Bangkok shop. You scroll to walk across the street up to the window, and you click things in the shop to learn about the work.

**Live:** https://pongsakorn-naklang.vercel.app

![The storefront by day, a tuk-tuk passing](docs/storefront-day.jpg)

## What you can do on the page

| Object | What it does |
|---|---|
| Things in the PROJECTS case | Each opens its project (the list comes from the database) |
| Bankza behind the counter | Says hi and tells you about himself; order a drink and he walks to the machine and makes it while you watch, then you pick a seat; opens the portfolio book; dances while the music's on |
| Menu stand | Skills, listed like a coffee menu |
| A-frame sign | A short hello |
| Door | Opens and closes; when it's open you can scroll on into the shop |
| Seats | Sit down with your drink: tap it to sip, drag to look around |
| Record player | Music on/off; the tone arm drops onto the record and it spins |
| Vinyl shelf | The records come off it into a row to flip through; pick one to play, or request a song |
| Yellow book on the table | The portfolio book: every project, page by page |
| Blue board | Draw a note on the shared guestbook |
| Box on the bookshelf | UYES, a card game against Bankza |
| Sleeping cat | Pet it |
| Tip jar | Tip a coffee by PromptPay, TrueMoney or Ko-fi |
| Wall clock | Shows the visitor's real time |
| Lamps | Switch each light on/off |
| Red mailbox | Contact links |
| 7-Eleven across the road | The door chime |
| Passing taxi or tuk-tuk | A beep; double-tap it and it stops, the driver asking if you want a ride: hop in and ride in the back while they chat, then "Get out" drops you at the shop |
| Mynas on the wire | Shoo them off |

Some things are left for you to find: pouring your own latte art, a game of checkers (หมากฮอส) at the centre table, and two secret records.

The time of day follows the visitor's clock (add `?time=day`, `sunset` or `night` to the URL to force it). A tour of everything you can tap runs on the first visit; the **?** button opens it again.

## How it's built

```
blender/build_storefront.py   builds the whole scene in Blender from code (headless)
blender/export_web.py         exports web/storefront.glb (Draco) + web/rig.json
blender/export_mixamo.py      exports the character in an A-pose for Mixamo
blender/prep_meshy.py         shrinks the raw Meshy street models into meshy/street/*.glb
mixamo/                       the Mixamo-rigged character with Waving and Breathing Idle clips
web/                          the static three.js page (no build step)
web/api/                      small Vercel Functions: the display case's projects, the shared guestbook board, the visitor counter, shared tallies
db/                           the database tables (Neon Postgres, connected through Vercel)
```

**Rebuild the model and the web files** (Blender 4.2 or newer):

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P blender/build_storefront.py -- --time day --out out/storefront_day.blend --render out/day.png
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b out/storefront_day.blend -P blender/export_web.py -- web
```

**Run the page locally** (with the API, so it reads the database; the first run links the Vercel project and pulls its settings into `web/.env.local`):

```bash
cd web && npm install && vercel dev --listen 5173
```

**Edit the text on the cards** in [web/content.js](web/content.js).

**Edit what's in the display case** in the Neon console (Vercel → Storage → nakang-db → Open in Neon → Tables → `projects`): one row per project, in `position` order across the top shelf then the bottom (8 spots). `model` picks the 3D model: a Blender one such as `ipod_classic`, or a shape, `sphere`, `cube` or `pyramid`; left empty it's a sphere. The site shows changes within a minute. The tables are described in [db/](db/).

**The guestbook board** is shared: every save adds a row to the `guestbook` table and the site shows the newest. The last 50 are kept, so to undo a spoiled board, delete the rows newer than the good one. More detail on the Blender side is in [blender/README.md](blender/README.md).

## Versioning and releases

Versions follow [Semantic Versioning](https://semver.org), read for a website:

- **Major**: the scene or the way you move through it changes in a big way.
- **Minor**: a new object, interaction or page feature.
- **Patch**: fixes, text and small visual tweaks.

Every release is listed in [CHANGELOG.md](CHANGELOG.md). To cut one:

1. Move the **Unreleased** notes in `CHANGELOG.md` under a new version heading with today's date.
2. Commit, then tag it: `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push --follow-tags`.
3. Deploy: `vercel deploy --prod` from `web/`.
4. Publish the GitHub release from the changelog notes: `gh release create vX.Y.Z --notes-file <notes>`.

## Credits

- Sign font: Archivo by Omnibus-Type, SIL Open Font License (`blender/fonts/OFL-Archivo.txt`).
- Character, tuk-tuk, taxi and myna models: generated with Meshy.
- Character animation: Mixamo (Waving, Breathing Idle).
- Sound effects: CC0 from OpenGameArt (see `web/sfx/CREDITS.md`).
- 3D library: [three.js](https://threejs.org).
