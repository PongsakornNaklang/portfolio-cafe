# Changelog

All notable changes to this site. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added
- After ordering, pick any seat: the corner table, the stools at the middle table, the window bench, or the plastic chair outside.
- While seated, drag (or swipe) to look around.
- The character waves with a little "huh!" at the tour's "That's me" step and whenever he says hello.

### Fixed
- A card opened during the tour no longer stays floating on screen after Next or Back.
- The tour camera frames each thing whole, instead of cutting off the character's head or the menu, and goes inside so plants and the menu stand no longer block the view.

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
