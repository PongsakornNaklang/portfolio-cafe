# Changelog

All notable changes to this site. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added
- A tip jar on the counter, past the PICKUP tray: a glass jar with a few coins and baht notes and a TIPS tag. Tap it for "Tip me a coffee", with a tab for each way to tip: PromptPay and TrueMoney QRs, and Ko-fi (card or PayPal, from abroad). They come from a new `settings` table (`db/settings.sql`, served by `web/api/settings.js`): `tip_qr_promptpay`, `tip_qr_truemoney` (and `tip_qr_alipay` when there is one) hold the QRs as data URLs and `kofi_url` the link, so any of them can change in the Neon console without a deploy; a tab shows only for what's set. Cards can have tabs (`tabs: [{ label, src, alt } | { label, note, go, run }]`).
- Ko-fi tips without leaving the shop: "☕ Tip on Ko-fi" opens Ko-fi's own tip panel in a window over the scene (with a link to open it in a new tab).
- The tip jar fills with real tips: Ko-fi's webhook posts each payment to `web/api/tips.js`, which checks Ko-fi's verification token (`KOFI_VERIFICATION_TOKEN`) and saves it to a new `tips` table (`db/tips.sql`). Each tip adds a coin to the jar (up to 40), the card counts the coffees so far, and thanks the latest supporter who made their tip public, with their message; he waves when you tap the jar. A supporter's email is never kept, and a private tip keeps no name or message. Cards can now show a picture (`img: { src, alt }` in `web/content.js`).
- Bankza talks on his own: leave the page alone for 10 seconds and he says something that fits where you are (out on the street, at the window, in the doorway, inside, at each seat, with your drink half gone or finished, with the music on or off, while he dances, by time of day), then again every 20 to 30 seconds at most, in a small bubble that goes after 4 seconds. He never talks over a card, a dialog, the tour, the seat picker or a game, and doesn't repeat himself until he's run out of things to say there. Up to one line in three is a hint at an easter egg you haven't found yet (the dance, checkers and Hard mode, the cat, the record shelf, the tuk-tuks and mynas, the 7-Eleven chime, the wall lamp, dragging to look around, the board, the night street); found ones are remembered in your browser and he stops hinting at them. The lines are in a new `lines` table (`db/lines.sql`, served by `web/api/lines.js`), so they can change in the Neon console without a deploy.
- He gestures as he talks: nods, shrugs, looks at what he's on about, waves, or shows the way to it with an open hand, palm up, elbow drawn back a touch; his head bobs while a line is up.
- He says hello as he waves when you walk up to the window, a different one each time (lines with spot `greet`); while the door's shut he tells you to tap it (`greet+door_shut`). His speech bubbles have no close button: tap one to put it away.
- The "Scroll to…" hint at the bottom is a button: tap it to walk up to the shop, or, with the door open, on inside.
- Latte art: order an iced latte and Bankza asks if you want to pour it yourself; after your first go, "🎨 Latte art" stays on the drinks menu. An espresso appears on the counter with a steel milk jug, coming in from the right, that follows your finger or mouse. Hold to pour (the jug tips in, the milk inside stays level whichever way it tips and drops as it empties, and spreads out on the coffee from the spout), drag toward you to pull through, and match the faint heart or tulip on the coffee. Serve for a score (milk that lands on the shape and how much of the shape you covered, forgiving a little), stars, a line from him and a wave or a shrug; your best is kept in this browser. Then "☕ Drink it": pick a seat and your cup, art and all, is your drink, sipped down like the others. The coffee's surface is simulated in `web/latte.js`; the target shapes are poured by the same simulation, so a good pour can match them. He invites you to try it (`hint_latte*` in `db/lines.sql`) until you have, then to have another go (a new `poured` spot).

### Changed
- Between games the checkers board sits on top of the drinks fridge behind the counter, set up and waiting (just for show: it isn't clickable). Starting a game pops it onto the centre table; when you're done it goes back.
- Closing the door from inside keeps you inside (it used to walk you back out to the window); walk back toward the shut door and it opens for you. Closing it from outside still steps you back to the window.
- The bird of paradise by the record shelf is smaller (stems and leaves at 75%).
- The display case holds 4 projects a shelf (8 in all, was 6), and the iPod is smaller (x4 toy scale, was x6).
- What's in the display case now comes from a database (Neon Postgres through Vercel, the `projects` table; `web/api/projects.js`), so projects can be added or changed without a rebuild. Each row picks its model: a Blender one like the iPod, or a sphere, cube or pyramid (a sphere when it's left empty), each in its own colour. The card text and the book's project pages come from the same rows.
- The guestbook board is shared: what you stick on it is saved to the database (`web/api/board.js`) and everyone sees the newest drawing. It only takes a PNG or WebP picture under 1.5 MB, one save per visitor every 15 seconds, and keeps the last 50 so a spoiled board can be put back.
- A visitor counter: white lettering on the door glass shows how many people have visited. Each visitor counts once a day, so reloading doesn't add more (`web/api/visits.js`, the `visits` table; only a keyed hash of the IP and the day is kept, never the IP).
- Shared tallies (`web/api/counters.js`, the `counters` table): petting the cat says how many times it's been petted by everyone; the drinks menu marks the most-ordered drink "★ Best seller"; and the checkers menu shows everyone's score against him on Easy and Hard ("you 12 · Bankza 34"), with the updated score in the bar when a game ends.
- Speech bubbles size to their text: a short one like the cat's purr no longer sits in a 320px box. The tour keeps its fixed width.
- The orange wall lamp is off in the daytime (on at sunset and night); a tap still switches it.
- After a game of checkers he reacts in his seat: both arms up, palms in, when he wins; head and shoulders down when he loses.
- His face and shirt are touched up in the texture at export (`paint_face` in `blender/export_web.py`): his right eye is now a mirror image of his left (it was ragged, with a pale streak through it), and the neckline and sleeve hems have clean edges in the shirt's own blue.
- More touch-ups: no blue spikes under his right sleeve, a clean edge where the shirt meets the trousers (no blue on the navy), and no pale scratches on the trousers. Every texture patch is now padded into its UV gutter in its own colour, so colours no longer bleed across seams at a distance.
- He dances facing the shop front (he used to face the PICKUP counter once you were inside).
- The loading screen counts up on the live site too: the server compresses the model and sends no length, so the page takes its size from `rig.json` (`glbBytes`, written at export).

### Performance
- Smoother: the scene renders at 1.5x the screen's pixels at most (was 2x on computers) and redraws the sun's shadows every other frame. Measured on a MacBook: 44–46 fps → 57–59 fps, with far fewer stutters.

### Fixed
- The guestbook board shows the newest drawing as the page opens. The API no longer sends `stale-while-revalidate`, which let the server's cache hand the first visitor an old board (even an empty one) until you opened the drawing window.
- Checkers: quitting while a cap was still hopping threw an error and left a stray cap on the board for the next game.
- Checkers: Play again within a second of the end could leave the camera stuck on the wide shot.
- Checkers: the win confetti carried on over the board after you left; it now clears with the game.
- Checkers: when you lose he waves from his stool (before, sitting hid the wave).
- His dance had drifted sideways into the plant by the counter (since the feet-on-the-floor fix): the dance's sway is measured from where the clip starts again, so he dances on his spot. His seat on the checkers stool is re-measured to match.
- Records filed in the shelf cubbies no longer poke through the side panels.
- The door is as tall as its frame (there was an 11 cm gap under the top beam).

## [1.2.0] - 2026-10-25

### Added
- After ordering, pick any seat: the corner table, the stools at the middle table, the window bench, or the plastic chair outside.
- Drag to look around, on the street and while seated: a glance of up to 30° either way on the street (the shop stays in view), all the way round inside the shop or seated (the plastic chair outside too). The cursor is an open hand where you can drag and closes while you drag. On a phone a sideways swipe turns your head and an up/down swipe still walks; your view eases back to straight ahead as you walk.
- Change seat while seated; your drink comes with you.
- Finish your drink and order another without leaving your seat.
- A slurp when you sip, with a rattle on the last one.
- Tap the vinyl shelf to pick a record: two lofi tracks (CC0, by omfgdude) or the shop's own tape.
- A yellow portfolio book on the centre table holds everything: cover, contents, about, skills, every project (iPort and this shop), an "Off the clock" page listing interests, and contact. It lies open two pages to a spread (one page on a phone); Next / Back, the arrow keys or a tap on either half turns a page over the spine, and the contents jump to any chapter. The tour now stops at the book.
- The centre table is taller (82 cm, was 74), with the record player and project book raised to match.
- An easter egg: sit at the centre table (order a drink, pick one of its stools) and his bubble has a yellow ♟ หมากฮอส? button for Thai checkers against him. Pick Easy or Hard and a board of bottle caps pops onto the end of the centre table (it's put away when you're done, and you're back on your stool), and the camera looks down from the stool by the door; tap one of your red caps on the black-and-white board, then a white dot. Thai rules: 8 caps a side, men move and capture forward only, kings (two caps stacked) fly and land right behind what they take, captures are compulsory and chain on, and whoever can't move loses. He walks over from the counter and sits on the stool across the board while you play (Mixamo Sitting Idle, `mixamo/sit.fbx`, with his arms down at his sides) (the camera shows him arrive, then looks down at the board) and walks back after. Caps hop as they move, and he comments in the bar along the bottom. The end of a game pops up big in the middle of the screen: win and confetti bursts off the board with a little rising jingle; lose and his caps hop for joy to a sad "wah wah wah waaah" while he waves. The rules and the bot are in `web/checkers.js` (checked by `node web/checkers.check.mjs`); Hard looks several moves ahead and beats Easy every time.
- The loading screen is the shop's roll-up shutter: a yellow NAKANG sign swings gently on it with a striped progress bar and "Opening the shop… 42%", and when the shop is ready the shutter rolls up to show it.
- His bubble has a See my portfolio button. The book floats in from the button (or from the book on the table when you tap that), grows to the middle of the screen, and opens from the cover to the contents. Closing it (×, Esc or a tap outside) floats it back down onto the table.
- Across the road: a Bangkok 7-Eleven in a white shophouse, with five lit sign panels, louvred windows upstairs, a glass front with shelves, ATMs and a red promo stand. You see it from the window seats. Tap it and the door chime plays its "ding-dong".
- While music plays, tap the character and his bubble offers Dance: he walks out from behind the counter to the open floor by the record table and does a hip-hop dance until you pick Stop dancing or the music ends, then walks back. The walk and the dance are Mixamo clips (Walking, Wave Hip Hop Dance in `mixamo/`), retargeted onto him in the Blender build; the dance keeps its crouches and bounces, he walks at the clip's own pace so his feet don't slide, and the spot was measured over the whole dance so he doesn't kick the counter or the table. The Dance button is yellow, like the easter egg it is.
- Inside the shop the street goes quiet: traffic, horns, birds and the street hum are softer and duller with the door shut, and only a little softer with it open. Music and the cat stay as they are.
- Shophouses on both sides of the road, all the way to the ends of the street. Each front is one painted image (brick, stone and mosaic tiles, or paint), with a shutter or glass shop floor, a sign spelling the shop's name (NOODLE, TAILOR, SALON…), and windows dressed with curtains, blinds or grilles, air-con boxes, pot plants and rain streaks.
- A ginger shop cat naps on a shell chair in the corner (a Meshy model, its raised stripes flattened into the fur). It breathes slowly; tap it to pet it and it purrs. That chair is no longer a seat, but you can sit next to it.
- At night the traffic drives with its headlights on: two on the taxi, one in the middle of the tuk-tuk's nose, each throwing a beam onto the road ahead.
- A round orange glass wall lamp above the cat's corner, its white cord hanging to the floor: it washes the wall and the corner table in orange. Tap it to switch it on or off.
- Recessed downlights in the shop ceiling: seven round warm cans in two rows, three of them lighting the room below.
- Warm LED strips in a ceiling cove along the back and side walls, with a soft glow down the walls, and a recessed LED line across the front edge of the ceiling (it closes the slot where the brick facade showed from inside); brighter after dark.
- The tuk-tuk's and taxi's wheels turn as they drive: cut out of the Meshy models by `prep_meshy.py`, each spinning on its own axle.
- Tap a passing tuk-tuk or taxi: beep beep, then the dog barks or the cat meows. Tap a myna on the wire and the birds nearby fly off.
- The character waves with a little "huh!" at the tour's "That's me" step and whenever he says hello.

### Changed
- Your bubble talks: it says your intro one sentence at a time ("Hi, I'm Pongsakorn, but you can call me Bankza.", then what you do, games, open to full-time roles), fading from one to the next, and stops on a different sign-off each time ("Nice to see you!", "Have a good day!"…). The portfolio book prints the intro as one paragraph.
- Our shop's front is red brick with a dark coping along the top, after cafés like KONZ and Mirak. The left neighbour is cream stone tiles with white mosaic upstairs; the right is red brick with a darker brick upper floor and gas tanks on the ledge.
- The cards now say who you are, starting from the old portfolio (my-portfolio-2025) and rewritten: a full-stack intro that mentions building this shop with Meshy and Claude Code; a menu of Next.js + React, Node.js, TypeScript, Tailwind CSS, Three.js + Blender, and the AI tools Claude Code and Meshy; สวัสดีครับ! on the A-frame; and Contact says you're looking for a full-time role.
- The tuk-tuk and taxi are much closer to the Meshy originals: about 50k faces and 2048 px paint each (was 20-25k and 1024 px), so the panels are smooth and the paint sharp. The page download grows by about 4 MB.

### Fixed
- The shop's lamps light downward like their shades instead of glowing up onto the ceiling: the pendants are wide downlights, twice as bright as before, and nothing shines straight onto the cup shelf.
- His arms and legs are rounder: the export smooths his low-poly mesh once, keeping the colour borders (sleeves, hem, hairline) where the texture painted them.
- A soft shadow under his feet, so he doesn't look like he's hovering indoors, where the lamps cast none.
- His feet stand on the floor: the build had lifted him 25 cm, and each clip's hip height now counts from standing, so a crouch or bent knees don't lift him either.
- He stands lower behind the counter (the staff platform is 10 cm lower), so his knees stay below the counter top.
- Once you're inside, he turns his whole body to face the PICKUP counter instead of the street.
- Walking and dancing, his head follows the move instead of staying turned toward you; he looks at you when he stands still.
- His idle no longer holds his arms back: it's the Mixamo Breathing Idle now instead of Meshy's.
- Mixamo clips on the Meshy character no longer push his arms into his body: the build lines his A-pose rest up with Mixamo's T-pose before copying the motion (the wave looks right too).
- His face is sharper: the export keeps his textures at Meshy's full 4K (as JPEG) instead of shrinking them to 1K.
- A click no longer turns the view: dragging to look around only starts after the pointer moves 6 px with the button held, a slow drag no longer also counts as a tap, and a lost button release can't leave the view following the mouse.
- A speech bubble closes when you click elsewhere or drag to look around (it shrinks back toward its tail and fades out), and stays pinned to what it's about while the camera moves.
- The open door no longer swings into the side wall with its handle through the guestbook board: it stops at 80° and the board sits further into the shop.
- The book's cover title is crisp lettering, not a black bar.
- Cars and tuk-tuks keep driving past while you're inside or seated, not only on the street.
- A strip of sky showed through the floor under the shop window.
- The seat bar and the scroll hint no longer cover the sound and ? buttons on phones.
- Cards, the tour box and buttons block what's behind them: no hover label or tap goes through to the scene.
- A card opened during the tour no longer stays floating on screen after Next or Back.
- The tour camera frames each thing whole, instead of cutting off the character's head or the menu, and goes inside so plants and the menu stand no longer block the view.

### Removed
- The LED strips under the cup shelf boards.

## [1.1.0] - 2026-10-24

### Added
- The character is now the Meshy-made figure, with a breathing idle and a wave.
- Order a drink from the character, then sit at the corner table and tap it to sip.
- A guided tour that flies the camera to each thing you can tap (the **?** button replays it).
- Music notes float up from the record player while it plays.
- Traffic in both lanes: a dog drives a blue tuk-tuk and a cat drives a pink taxi (Meshy models), each with its own engine sound.
- Mynas fly in and perch on the power lines; a quiet street sound bed and a mute button.

### Changed
- Cards close when you scroll.

### Fixed
- See-through patches on the character's face and shirt, where the hair behind showed through.
- Smooth surfaces on the character (no more hard light patches on the face and shirt) and on the tuk-tuk, taxi and myna (no more dents).

## [1.0.0] - 2026-10-24

### Added
- Wall clock that shows the visitor's real time; clicking it shows the time and date.
- Blue plastic monobloc chair beside the meatball cart.
- Brushed-silver dish pendant lamps; click to switch each one on or off.
- Contact card on the red mailbox, with GitHub and email links.
- The record spins while music plays.
- The door opens and closes, and with it open the scroll walk carries on inside to the counter.
- Guestbook board: draw a note with a mouse or finger, and it appears on the board (kept in the visitor's browser).

### Removed
- Sticker Board link on the door.

## [0.3.0] - 2026-10-23

### Added
- First-visit tour, reopened with the **?** button.
- Character rigged in Mixamo: breathing idle, a wave when you reach the window or click him, and eye contact.
- Click feedback: a soft pop, a short vibration on phones, and a bounce.
- Real text on the menu stand and the A-frame sign; a PROJECTS label on the display case.
- Thai street props: power pole with tangled cables, meatball cart, red Thai Post mailbox.
- Warm backlight in the project case and a brick-paver sidewalk.

### Changed
- The model is Draco-compressed, down from 9 MB to about 3 MB, with lighter rendering on phones.
- Cards open next to the clicked object instead of covering it.
- Aluminium frames are a bright silver.

### Removed
- Tapes and boomboxes in the project case.

## [0.2.0] - 2026-10-23

### Added
- Web export from Blender (`storefront.glb` plus a camera and hotspot rig).
- three.js page: scroll from across the street to the shop window, time of day from the visitor's clock, speech-bubble cards, and a built-in lofi loop on the record player.
- First deploy to Vercel.

## [0.1.0] - 2026-10-23

### Added
- Blender build script for the 3D toy storefront: street, NAKANG lightbox sign, shop front, interior seen through the glass, character, and clickable hotspots.

[Unreleased]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PongsakornNaklang/portfolio-cafe/releases/tag/v0.1.0
