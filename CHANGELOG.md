# Changelog

All notable changes to this site. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

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

[Unreleased]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/PongsakornNaklang/portfolio-cafe/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/PongsakornNaklang/portfolio-cafe/releases/tag/v0.1.0
