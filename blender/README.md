# Storefront diorama (Blender)

`build_storefront.py` builds the 3D-toy storefront from code: the street, the building, the shop front, the interior you see through the glass, the project shelf, the lights and the camera.

## Run

Needs Blender 4.2 or newer. On macOS the binary lives inside the app:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b -P blender/build_storefront.py -- --time day --out out/storefront.blend --render out/day.png
```

- `--time`: `day`, `sunset` or `night`
- `--out`: saves the `.blend` file, which you can open and refine by hand
- `--render`: saves a preview PNG

The script rebuilds the whole scene every run. Hand edits belong in the saved `.blend`. If you want a change to survive the next build, put it in the script instead.

## Naming rules the website reads

| Name / property | Meaning |
|---|---|
| `HOT_*` + custom property `hotspot` | Clickable. Values: `about`, `music`, `skills`, `hello`, `door`, `guestbook`, `contact`, `clock`, `lamp`, `project:<id>` |
| `SLOT_01` … `SLOT_06` | Spots on the display shelf for projects |
| `PATH_walk` | The route the website camera walks along, from the street to the shop |
| `CAM_front` | Preview camera |

Keep the `HOT_` empties and their `hotspot` values when you remodel a piece. Swap the meshes under them freely.

## Add a project

1. Add an entry to `PROJECTS` (`id`, `builder`, `url`).
2. Write a builder function that models the object in local coordinates under the holder empty, then register it in `PROJECT_BUILDERS`.

The project lands in the next free `SLOT_`.

## Fonts

The sign uses `fonts/ArchivoExpanded-ExtraBold.ttf`, the static Archivo instance from Google Fonts (wdth 125, wght 800), licensed under the SIL Open Font License (`fonts/OFL-Archivo.txt`). To change the font, put a static `.ttf` in `fonts/` and list it first in `SIGN_FONTS`. Blender only reads a variable font's default instance.

## Placeholders worth refining by hand

- `HOT_character`: you, behind the counter
- `HOT_project_iport`: the iPod classic
- Plants and stools: simple ball/cone shapes for now

## Web export

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b out/storefront_day.blend -P blender/export_web.py -- web
```

This writes `web/storefront.glb` (text baked to meshes, character decimated, `hotspot` kept as glTF extras) and `web/rig.json` (camera shots and hotspot positions). The page in `web/` is static: serve the folder with any static server, e.g. `python3 -m http.server -d web`. Card text lives in `web/content.js`. Add `?time=day|sunset|night` to the URL to override the visitor's clock.

## Character animation (Mixamo)

1. `blender -b out/storefront_day.blend -P blender/export_mixamo.py -- mixamo/nakang_character.fbx` exports the character in an A-pose.
2. Upload it to mixamo.com, auto-rig it (No Fingers), pick **Waving**, download FBX Binary, With Skin, 30 fps, and save it as `mixamo/waving.fbx`.
3. Optional: download **Breathing Idle** (Without Skin, same settings) as `mixamo/idle.fbx`.
4. When `mixamo/waving.fbx` exists, `build_storefront.py` swaps in that rigged character; the clips export to the web as `wave` and `idle`.
