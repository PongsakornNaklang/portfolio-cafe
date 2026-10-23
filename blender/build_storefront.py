"""Build the 3D-toy storefront diorama for the portfolio.

Run headless (Blender 4.2+):
    blender -b -P blender/build_storefront.py -- --time day --out out/storefront.blend --render out/day.png

Options after `--`:
    --time   day | sunset | night   (lighting preset, default: day)
    --out    path to save the .blend (optional)
    --render path to save a preview PNG (optional)

Conventions the website relies on:
    * Objects whose name starts with HOT_ are clickable. Each carries a custom
      property `hotspot` (exported to glTF extras) that the site maps to content.
    * Empties named SLOT_01..SLOT_06 mark the display-case spots for projects.
      Add a project = add an entry to PROJECTS + a builder in PROJECT_BUILDERS.
    * Units are metres. Facade front sits on y = 0, street runs toward -Y, Z is up.
"""

import argparse
import os
import random
import sys
from math import cos, degrees, pi, radians, sin

import bmesh
import bpy
from mathutils import Euler, Vector

# ---------------------------------------------------------------- config

SIGN_TEXT = "NAKANG"
# Extra shop-front width (m) added to the right of the centre pillar: more glass, room for benches.
EXTRA_W = 1.8
# First font that loads wins. Archivo Expanded ExtraBold (Google Fonts, OFL) ships in blender/fonts/.
SIGN_FONTS = [os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts", "ArchivoExpanded-ExtraBold.ttf"),
              "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"]

# One entry per project on the display shelf, in slot order.
PROJECTS = [
    {"id": "iport", "builder": "ipod_classic", "url": "https://iport-pi.vercel.app/"},
]

PALETTE = {
    "concrete": "#d9d6cf", "concrete_dark": "#c9c5bc", "wall": "#f4f2ec", "block_a": "#e7e3da",
    "block_b": "#dcd8cf", "mortar": "#b9b4aa", "plywood": "#e6cfa6", "steel": "#c4c8cc",
    "frame": "#dcdcd8", "sign": "#ffe100", "sign_frame": "#e4e4e0", "ink": "#2b2420", "display": "#fff6dc",
    "glass": "#eef7fa", "stool_red": "#e8483b", "stool_blue": "#3c6fd8", "leaf": "#5f9a4a",
    "leaf_dark": "#4a7d3a", "pot": "#c9714a", "asphalt": "#8a8f99", "curb_red": "#d9473c",
    "curb_white": "#f2f0ea", "sidewalk": "#dcd8cf", "pink": "#f3d9cf", "mint": "#d6e6dd",
    "shutter": "#c9ccd0", "skin": "#efbba3", "hair": "#2a211c", "shirt": "#33415c",
    "black": "#26262a", "white": "#fbfaf6", "ipod": "#2d2f33", "ipod_wheel": "#55585e", "ipod_screen": "#6fa8dc",
    "mat": "#c45a3c", "oak": "#c9a46c", "stool_seat": "#d8873a", "sky": "#bfe3ff",
}

# Lighting presets. `emit` scales every emissive material.
PRESETS = {
    "day":    {"sun": 2.8, "sun_color": (1.0, 0.96, 0.9), "sun_rot": (55, 0, -40), "world": "#bfe3ff", "world_k": 0.22, "emit": 1.0, "interior": 300, "refl": 0.9},
    "sunset": {"sun": 2.0, "sun_color": (1.0, 0.68, 0.42), "sun_rot": (74, 0, -60), "world": "#f6c7a1", "world_k": 0.18, "emit": 1.4, "interior": 300, "refl": 0.6},
    "night":  {"sun": 0.15, "sun_color": (0.6, 0.7, 1.0),  "sun_rot": (55, 0, -40), "world": "#2a3866", "world_k": 0.25, "emit": 2.5, "interior": 600, "refl": 0.15},
}

# ---------------------------------------------------------------- helpers

_mats = {}
_emissive = []  # (principled node, base strength)
_coll = {"current": None}


def lin(hexcol):
    """sRGB hex -> linear RGBA, which is what Principled BSDF expects."""
    h = hexcol.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


def set_input(node, names, value):
    for n in names:  # input names changed between Blender 3.x and 4.x
        if n in node.inputs:
            node.inputs[n].default_value = value
            return


def mat(name, color=None, rough=0.65, metal=0.0, emit=0.0, alpha=1.0):
    if name in ("oak", "plywood") and color is None and not emit:
        return wood_mat(name)
    key = (name, color, rough, metal, emit, alpha)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    rgba = lin(PALETTE.get(color or name, color or "#ff00ff"))
    b.inputs["Base Color"].default_value = rgba
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        set_input(b, ("Emission Color", "Emission"), rgba)
        set_input(b, ("Emission Strength",), emit)
        _emissive.append((b, emit))
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"  # 4.2+
        except AttributeError:
            m.blend_method = "BLEND"
    m.diffuse_color = rgba  # viewport solid colour
    _mats[key] = m
    return m


def use_collection(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    _coll["current"] = c
    return c


def _finish(obj, material, bevel, parent):
    if material:
        obj.data.materials.append(material)
    if parent:
        obj.parent = parent
    _coll["current"].objects.link(obj)
    if obj.type == "MESH":
        for p in obj.data.polygons:
            p.use_smooth = True
        try:
            obj.data.use_auto_smooth = True  # needed before 4.1, gone after
        except AttributeError:
            pass
        if bevel > 0:
            m = obj.modifiers.new("Bevel", "BEVEL")
            m.width = bevel
            m.segments = 4
            m.limit_method = "ANGLE"
            m.harden_normals = True
        w = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        w.keep_sharp = True
    return obj


def _mesh_obj(name, build, loc, rot):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    obj.rotation_euler = [radians(a) for a in rot]
    return obj


def box(name, size, loc, material, parent=None, bevel=0.03, rot=(0, 0, 0), uv_fit=None):
    bevel = min(bevel, min(size) * 0.45)

    def build(bm):
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if uv_fit == "xz":  # the whole image fills the front (XZ) face once
            uv = bm.loops.layers.uv.new("UVMap")
            for f in bm.faces:
                for lp in f.loops:
                    lp[uv].uv = (lp.vert.co.x / size[0] + 0.5, lp.vert.co.z / size[2] + 0.5)
        else:
            _box_uvs(bm)

    return _finish(_mesh_obj(name, build, loc, rot), material, bevel, parent)


def _box_uvs(bm):
    """Box-projected UVs in metres: each face takes the two axes it spans."""
    uv = bm.loops.layers.uv.new("UVMap")
    bm.normal_update()
    for f in bm.faces:
        n = [abs(c) for c in f.normal]
        ax = n.index(max(n))
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = (co.y, co.z) if ax == 0 else ((co.x, co.z) if ax == 1 else (co.x, co.y))


def prism(name, outline, z0, height, material, parent=None, bevel=0.02):
    """Extrude a 2D outline (metres, world XY) straight up into one solid piece, e.g. an L-shaped counter."""
    def build(bm):
        face = bm.faces.new([bm.verts.new((x, y, z0)) for x, y in outline])
        ext = bmesh.ops.extrude_face_region(bm, geom=[face])
        bmesh.ops.translate(bm, vec=(0, 0, height), verts=[g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        _box_uvs(bm)

    return _finish(_mesh_obj(name, build, (0, 0, 0), (0, 0, 0)), material, bevel, parent)


def cyl(name, r1, depth, loc, material, parent=None, r2=None, segments=32, bevel=0.01, rot=(0, 0, 0)):
    """Cylinder (or cone when r2 differs) along local Z."""
    bevel = min(bevel, depth * 0.45, r1 * 0.45)

    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                              radius1=r1, radius2=r1 if r2 is None else r2, depth=depth)

    return _finish(_mesh_obj(name, build, loc, rot), material, bevel, parent)


def ball(name, r, loc, material, parent=None, scale=(1, 1, 1), rot=(0, 0, 0)):
    def build(bm):
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r)

    obj = _mesh_obj(name, build, loc, rot)
    obj.scale = scale
    return _finish(obj, material, 0, parent)


def skin_body(name, joints, bones, material, parent, levels=2):
    """Organic limb/torso mesh grown from a joint skeleton (Skin modifier + Subsurf): shoulders, elbows and wrists
    flow into each other like clay. joints: [(x, y, z, rx, ry)], bones: [(i, j)]."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([j[:3] for j in joints], bones, [])
    obj = bpy.data.objects.new(name, me)
    obj.data.materials.append(material)
    obj.parent = parent
    _coll["current"].objects.link(obj)
    sk = obj.modifiers.new("Skin", "SKIN")
    sk.use_smooth_shade = True
    for i, j in enumerate(joints):
        obj.data.skin_vertices[0].data[i].radius = j[3:5]
    obj.data.skin_vertices[0].data[0].use_root = True
    sub = obj.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = sub.render_levels = levels
    return obj


def bake_modifiers(obj):
    """Freeze the modifier stack into the mesh (needed before automatic skin weights)."""
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)
    obj.vertex_groups.clear()


def rig_character(body, shirt, root, wave_shoulder, wave_elbow):
    """Give the body a real skeleton: the Skin modifier's own armature (one bone per skin edge), with the body and
    the tee bound to it by automatic weights, so an arm bends as one continuous piece and the sleeve follows.
    Renames the waving arm's bones to char_wave_shoulder / char_wave_elbow for the web page."""
    with bpy.context.temp_override(active_object=body, object=body, selected_objects=[body], selected_editable_objects=[body]):
        bpy.ops.object.skin_armature_create(modifier="Skin")
    rig = next(m.object for m in body.modifiers if m.type == "ARMATURE")
    rig.name = rig.data.name = "char_rig"
    rig.parent = root  # the skin joints are in the character's local space, so the rig sits at the character's origin
    rig.matrix_parent_inverse.identity()
    rig.matrix_basis.identity()
    bpy.context.view_layer.update()
    body.modifiers.remove(next(m for m in body.modifiers if m.type == "ARMATURE"))
    bake_modifiers(body)
    bake_modifiers(shirt)
    to_rig = rig.matrix_world.inverted() @ root.matrix_world

    def nearest(p, below=True):
        p = to_rig @ Vector(p)
        bones = [b for b in rig.data.bones if not below or b.tail_local.z < b.head_local.z - 0.02]
        return min(bones, key=lambda b: (b.head_local - p).length)
    nearest(wave_shoulder).name = "char_wave_shoulder"
    nearest(wave_elbow).name = "char_wave_elbow"
    for ob in (body, shirt, rig):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(active_object=rig, object=rig, selected_objects=[body, shirt, rig],
                                   selected_editable_objects=[body, shirt, rig]):
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    for ob in (body, shirt, rig):
        ob.select_set(False)
    for ob in (body, shirt):  # same local space as the rig: drop the parent-inverse the operator computed
        ob.matrix_parent_inverse.identity()
        ob.matrix_basis.identity()
    return rig


def fuse(name, parts, material, parent, voxel=0.007, smooth=8):
    """Clay look: merge overlapping primitives (modifiers applied) into one mesh, then voxel-remesh + smooth
    so the joins melt into a single seamless body (blender-modeling: organic -> voxel remesh, no seams)."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    to_parent = parent.matrix_world.inverted()
    bm = bmesh.new()
    for ob in parts:
        m = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        m.transform(to_parent @ ob.matrix_world)
        bm.from_mesh(m)
        bpy.data.meshes.remove(m)
        bpy.data.objects.remove(ob)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.data.materials.append(material)
    obj.parent = parent
    _coll["current"].objects.link(obj)
    r = obj.modifiers.new("Remesh", "REMESH")
    r.mode, r.voxel_size, r.use_smooth_shade = "VOXEL", voxel, True
    sm = obj.modifiers.new("Smooth", "CORRECTIVE_SMOOTH")
    sm.iterations, sm.use_only_smooth = smooth, True
    return obj


def empty(name, loc, parent=None, hotspot=None, rot=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.2
    obj.location = loc
    obj.rotation_euler = [radians(a) for a in rot]
    if parent:
        obj.parent = parent
    if hotspot:
        obj["hotspot"] = hotspot
    _coll["current"].objects.link(obj)
    return obj


def text(name, body, size, loc, material, parent=None, extrude=0.02, fonts=(), rot=(90, 0, 0), align="LEFT"):
    cu = bpy.data.curves.new(name, type="FONT")
    for path in fonts:
        try:
            cu.font = bpy.data.fonts.load(path, check_existing=True)
            break
        except (RuntimeError, OSError):
            continue
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = 0.004
    cu.align_x = align
    cu.align_y = "CENTER"
    obj = bpy.data.objects.new(name, cu)
    obj.location = loc
    obj.rotation_euler = [radians(a) for a in rot]  # default: stand up, facing -Y (the street)
    return _finish(obj, material, 0, parent)


# ---------------------------------------------------------------- street

def paver_image(px=256, seed=31):
    """Brick pavers (1.6 m tile): 16 x 32 bricks in running bond, mixed warm greys and dusty rose, light joints."""
    rnd = random.Random(seed)
    tones = [rgb(c) for c in ("#b9b2aa", "#a9a19a", "#c4bcb3", "#b59a92", "#a88a82", "#c7b3a9", "#9f9893")]
    rows, cols = 32, 16
    bw, bh = px // cols, px // rows
    pick = [[rnd.choice(tones) for _ in range(cols + 1)] for _ in range(rows)]
    joint = rgb("#d8d3cb")

    def pixel(x, y):
        r = y // bh
        xo = (x + (bw // 2 if r % 2 else 0)) % px
        c = xo // bw
        if y % bh == 0 or xo % bw == 0:
            return joint
        k = 0.96 + 0.08 * ((x * 7 + y * 13) % 5) / 5
        return tuple(min(1.0, v * k) for v in pick[r][c])
    return make_image("pavers", px, px, pixel)


def build_street():
    use_collection("Street")
    box("road", (40, 12, 0.1), (0, -9.2, -0.05), mat("asphalt", rough=0.9), bevel=0)
    for i in range(-9, 10):
        box(f"lane_{i}", (1.2, 0.12, 0.02), (i * 2.2, -9.0, 0.005), mat("curb_white"), bevel=0.01)
    # sidewalk like the reference: small grey/rose brick pavers, plus a smooth stone strip along the shop front
    box("sidewalk", (40, 3.0, 0.15), (0, -1.7, 0.075), image_mat("pavers", paver_image(), rough=0.85, box_scale=1 / 1.6), bevel=0.02)
    box("sidewalk_strip", (40, 0.4, 0.152), (0, -0.2, 0.076), mat("stone_strip", color="#d9d5cd", rough=0.6), bevel=0.01)
    # Bangkok kerb: red and white stripes
    for i in range(80):
        x = -20 + 0.25 + i * 0.5
        col = "curb_red" if i % 2 else "curb_white"
        box(f"kerb_{i}", (0.48, 0.18, 0.16), (x, -3.12, 0.08), mat(col), bevel=0.02)
    cyl("utility_pole", 0.14, 8.0, (-6.2, -2.7, 4.0), mat("steel", rough=0.6), r2=0.11)

    # neighbours: plain pastel shophouses, one with a roll-up shutter
    box("neighbour_left", (6, 0.4, 9), (-7.5, 0.2, 4.65), mat("pink"), bevel=0.04)
    box("neighbour_right", (6, 0.4, 9), (7.5 + EXTRA_W, 0.2, 4.65), mat("mint"), bevel=0.04)
    box("shutter", (3.2, 0.08, 2.7), (7.5 + EXTRA_W, -0.02, 1.5), mat("shutter", rough=0.5, metal=0.3), bevel=0.02)
    for i in range(18):
        box(f"shutter_rib_{i}", (3.2, 0.03, 0.03), (7.5 + EXTRA_W, -0.07, 0.25 + i * 0.145), mat("concrete_dark"), bevel=0.01)

    for i, (x, y, col) in enumerate([(-4.75, -1.55, "stool_red"), (-4.2, -2.15, "stool_red"), (3.95 + EXTRA_W, -1.6, "stool_blue")]):
        stool(f"stool_{i}", (x, y, 0.15), col)
    cyl("cup_on_stool", 0.05, 0.12, (-4.75, -1.55, 0.68), mat("white"), r2=0.06)
    plant("plant_out_right", (4.4 + EXTRA_W, -0.55, 0.15), 1.0)
    plant("plant_out_left", (-4.85, -0.55, 0.15), 0.8)


def stool(name, loc, color):
    g = empty(name, loc)
    cyl(f"{name}_body", 0.2, 0.42, (0, 0, 0.21), mat(color, rough=0.45), parent=g, r2=0.165, bevel=0.02)
    cyl(f"{name}_seat", 0.175, 0.04, (0, 0, 0.44), mat(color, rough=0.45), parent=g, bevel=0.015)
    cyl(f"{name}_hole", 0.03, 0.045, (0, 0, 0.445), mat("black"), parent=g, bevel=0.005)
    return g


def plant(name, loc, scale):
    g = empty(name, loc)
    cyl(f"{name}_pot", 0.22 * scale, 0.35 * scale, (0, 0, 0.175 * scale), mat("pot", rough=0.8), parent=g, r2=0.17 * scale)
    leaves = [(0, 0, 0.62, 0.26), (0.14, 0.05, 0.5, 0.2), (-0.15, -0.03, 0.52, 0.21), (0.03, -0.1, 0.8, 0.18), (-0.06, 0.1, 0.75, 0.17)]
    for i, (x, y, z, r) in enumerate(leaves):
        ball(f"{name}_leaf_{i}", r * scale, (x * scale, y * scale, z * scale),
             mat("leaf_dark" if i % 2 else "leaf", rough=0.7), parent=g)
    return g


def plank_bench(name, loc, length, height, depth):
    """Oak two-plank top on splayed stainless A-legs, like the reference cafe benches."""
    g = empty(name, loc)
    oak, steel = mat("oak", rough=0.6), mat("steel", rough=0.3, metal=0.85)
    for i, dy in enumerate((-depth / 4, depth / 4)):
        box(f"{name}_plank_{i}", (length, depth / 2 - 0.012, 0.045), (0, dy, height), oak, parent=g, bevel=0.01)
    for side, x in (("l", -length / 2 + 0.18), ("r", length / 2 - 0.18)):
        for k, rx in enumerate((14, -14)):
            box(f"{name}_leg_{side}{k}", (0.035, 0.035, height / 0.97), (x, 0, height / 2), steel, parent=g, bevel=0.008, rot=(rx, 0, 0))
        box(f"{name}_bar_{side}", (0.03, depth * 0.9, 0.03), (x, 0, height * 0.3), steel, parent=g, bevel=0.006)
    return g


# ---------------------------------------------------------------- building shell

def build_building():
    use_collection("Building")
    box("wall_upper", (9 + EXTRA_W, 0.4, 5.3), (EXTRA_W / 2, 0.2, 6.35), mat("wall", rough=0.85), bevel=0.04)
    box("pillar_right", (1.4, 0.4, 3.55), (3.8 + EXTRA_W, 0.2, 1.925), mat("concrete", rough=0.85), bevel=0.03)
    # left pillar: concrete blocks in running bond, like the reference
    box("pillar_left_mortar", (1.38, 0.36, 3.53), (-3.8, 0.22, 1.925), mat("mortar", rough=0.9), bevel=0)
    row_h = 3.55 / 10
    for row in range(10):
        z = 0.15 + row_h * (row + 0.5)
        widths = [0.7, 0.7] if row % 2 == 0 else [0.35, 0.7, 0.35]
        x = -4.5
        for j, w in enumerate(widths):
            col = "block_a" if (row + j) % 2 == 0 else "block_b"
            box(f"block_{row}_{j}", (w - 0.025, 0.4, row_h - 0.025), (x + w / 2, 0.2, z), mat(col, rough=0.85), bevel=0.025)
            x += w
    box("step", (6.6 + EXTRA_W, 0.9, 0.2), (EXTRA_W / 2, -0.45, 0.25), mat("concrete", rough=0.85), bevel=0.03)
    box("mailbox", (0.35, 0.2, 0.45), (-4.0, -0.12, 1.9), mat("steel", rough=0.5, metal=0.2), bevel=0.04)

    # air-con unit on the upper wall
    box("aircon", (0.9, 0.3, 0.6), (2.6 + EXTRA_W, -0.15, 5.2), mat("white"), bevel=0.04)
    cyl("aircon_fan", 0.2, 0.03, (2.8 + EXTRA_W, -0.31, 5.2), mat("concrete_dark"), rot=(90, 0, 0))
    cyl("aircon_pipe", 0.03, 1.4, (3.1 + EXTRA_W, -0.05, 4.5), mat("white"))

    # lightbox sign
    # lightbox like CASSE: thin light frame, deep-yellow glowing face, name small and left-aligned
    box("sign_frame", (6.5 + EXTRA_W, 0.4, 0.75), (EXTRA_W / 2, -0.1, 4.05), mat("sign_frame", rough=0.15, metal=1.0), bevel=0.03)
    box("sign_box", (6.36 + EXTRA_W, 0.44, 0.62), (EXTRA_W / 2, -0.15, 4.05), mat("sign", rough=0.5, emit=0.9), bevel=0.02)
    text("sign_text", SIGN_TEXT, 0.3, (-2.98, -0.375, 3.93), mat("ink", rough=0.6), extrude=0.008, fonts=SIGN_FONTS)


# ---------------------------------------------------------------- storefront

def build_storefront():
    use_collection("Storefront")
    frame = mat("frame", rough=0.12, metal=1.0)  # polished aluminium
    glass = mat("glass", rough=0.05, alpha=0.12)

    box("beam_top", (6.2 + EXTRA_W, 0.3, 0.12), (EXTRA_W / 2, 0.05, 3.7), frame, bevel=0.02)
    for name, x, w in [("post_left", -3.05, 0.1), ("post_door", 1.67 + EXTRA_W, 0.08), ("post_right", 3.05 + EXTRA_W, 0.1)]:
        box(name, (w, 0.3, 3.55), (x, 0.05, 1.925), frame, bevel=0.02)
    box("pillar_center", (0.35, 0.4, 3.55), (0.2, 0.1, 1.925), mat("white"), bevel=0.03)

    # display case (projects live here)
    box("case_plinth", (3.05, 0.6, 0.2), (-1.5, 0.02, 0.25), mat("concrete"), bevel=0.02)
    # soft pale-yellow backlight: a glowing back panel plus warm LED strips tucked under each shelf front
    box("case_back", (2.96, 0.04, 1.56), (-1.5, 0.28, 1.15), mat("case_glow", color="#ffe9a8", rough=0.5, emit=1.6), bevel=0)
    text("case_label", "PROJECTS", 0.1, (-2.9, 0.255, 1.88), mat("ink", rough=0.6), extrude=0.004, fonts=SIGN_FONTS)  # top-left of the case
    for name, z in (("case_led_low", 0.36), ("case_led_mid", 1.11), ("case_led_top", 1.93)):
        box(name, (2.9, 0.015, 0.012), (-1.5, -0.2, z), mat("case_led", color="#ffe29a", emit=6.0), bevel=0)
    box("case_shelf_low", (2.96, 0.5, 0.05), (-1.5, 0.02, 0.4), mat("plywood", rough=0.7), bevel=0.01)
    box("case_shelf_mid", (2.96, 0.5, 0.05), (-1.5, 0.02, 1.15), mat("plywood", rough=0.7), bevel=0.01)
    box("case_top", (3.05, 0.6, 0.1), (-1.5, 0.02, 2.0), frame, bevel=0.02)
    for name, x in [("case_side_l", -3.0), ("case_side_r", 0.0)]:
        box(name, (0.06, 0.6, 1.6), (x, 0.02, 1.15), frame, bevel=0.015)
    box("case_glass", (2.96, 0.02, 1.5), (-1.5, -0.26, 1.17), glass, bevel=0)

    # counter ledge + the open awning window above it
    box("counter_ledge", (3.05, 0.7, 0.06), (-1.5, -0.05, 2.08), mat("steel", rough=0.35, metal=0.6), bevel=0.015)
    pivot = empty("awning_pivot", (-1.5, -0.02, 3.65), rot=(-72, 0, 0))  # propped high so the seller's face shows
    box("awning_glass", (2.95, 0.04, 1.45), (0, 0, -0.725), glass, parent=pivot, bevel=0)
    for name, size, loc in [("awning_f_top", (3.0, 0.06, 0.06), (0, 0, 0)), ("awning_f_bot", (3.0, 0.06, 0.06), (0, 0, -1.45)),
                            ("awning_f_l", (0.06, 0.06, 1.45), (-1.48, 0, -0.725)), ("awning_f_r", (0.06, 0.06, 1.45), (1.48, 0, -0.725))]:
        box(name, size, loc, frame, parent=pivot, bevel=0.01)

    # fixed glass + door (door = entrance to the Sticker Board)
    box("glass_fixed", (1.23 + EXTRA_W, 0.02, 3.4), (1.015 + EXTRA_W / 2, 0, 1.87), glass, bevel=0)
    door = empty("HOT_door", (2.36 + EXTRA_W, -0.02, 0.2), hotspot="stickers")
    box("door_glass", (1.28, 0.02, 3.3), (0, 0, 1.65), glass, parent=door, bevel=0)
    for name, size, loc in [("door_f_l", (0.06, 0.06, 3.3), (-0.64, 0, 1.65)), ("door_f_r", (0.06, 0.06, 3.3), (0.64, 0, 1.65)),
                            ("door_f_b", (1.3, 0.06, 0.12), (0, 0, 0.06)), ("door_f_t", (1.3, 0.06, 0.06), (0, 0, 3.3))]:
        box(name, size, loc, frame, parent=door, bevel=0.01)
    cyl("door_handle", 0.025, 0.9, (-0.5, -0.1, 1.5), mat("steel", rough=0.25, metal=0.9), parent=door)
    box("doormat", (1.2, 0.6, 0.02), (2.36 + EXTRA_W, -0.45, 0.36), mat("mat", rough=0.95), bevel=0.01)

    # floor menu stand = skills / stack
    menu = empty("HOT_menu", (0.85, -0.75, 0.35), hotspot="skills")
    cyl("menu_base", 0.22, 0.03, (0, 0, 0.015), mat("steel", rough=0.3, metal=0.8), parent=menu)
    cyl("menu_pole", 0.02, 1.5, (0, 0, 0.75), mat("steel", rough=0.3, metal=0.8), parent=menu)
    board = box("menu_board", (0.6, 0.03, 0.8), (0, -0.02, 1.55), mat("white"), parent=menu, bevel=0.01, rot=(-8, 0, 0))
    ink = mat("ink", rough=0.6)
    text("menu_title", "MENU", 0.11, (0, -0.02, 0.26), ink, parent=board, extrude=0.003, fonts=SIGN_FONTS, align="CENTER")
    box("menu_rule", (0.46, 0.008, 0.008), (0, -0.02, 0.18), ink, parent=board, bevel=0)
    for i, row in enumerate(("FRONTEND", "BACKEND", "TOOLS")):  # categories only: the card in web/content.js lists the real stack
        text(f"menu_row_{i}", row, 0.05, (-0.21, -0.02, 0.08 - i * 0.1), ink, parent=board, extrude=0.002, fonts=SIGN_FONTS)
        box(f"menu_dots_{i}", (0.1, 0.008, 0.006), (0.15, -0.02, 0.065 - i * 0.1), mat("menu_dots", color="#b9b0a2"), parent=board, bevel=0)

    # A-frame sign = short greeting
    af = empty("HOT_aframe", (-3.6, -0.85, 0.15), hotspot="hello")
    front = box("aframe_front", (0.6, 0.03, 0.9), (0, -0.09, 0.44), mat("white"), parent=af, bevel=0.012, rot=(-12, 0, 0))
    box("aframe_back", (0.6, 0.03, 0.9), (0, 0.09, 0.44), mat("white"), parent=af, bevel=0.012, rot=(12, 0, 0))
    text("aframe_hello", "HELLO!", 0.12, (0, -0.02, 0.16), mat("ink", rough=0.6), parent=front, extrude=0.003, fonts=SIGN_FONTS, align="CENTER")
    text("aframe_sub", "come say hi", 0.055, (0, -0.02, 0.0), mat("ink", rough=0.6), parent=front, extrude=0.002, fonts=SIGN_FONTS, align="CENTER")


# ---------------------------------------------------------------- interior (seen through glass only)

TEX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "textures")


def srgb(hexcol):
    h = hexcol.lstrip("#")
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1.0]


def rgb(hexcol):
    return tuple(srgb(hexcol)[:3])


def make_image(name, w, h, pixel):
    """Write textures/<name>.png from pixel(x, y) -> (r, g, b) in sRGB 0..1, and return the image."""
    if name in bpy.data.images:
        return bpy.data.images[name]
    px = []
    for y in range(h):
        for x in range(w):
            px.extend(pixel(x, y))
            px.append(1.0)
    img = bpy.data.images.new(name, w, h)
    img.pixels.foreach_set(px)
    os.makedirs(TEX_DIR, exist_ok=True)
    img.filepath_raw = os.path.join(TEX_DIR, name + ".png")
    img.file_format = "PNG"
    img.save()
    return img


def tile_noise(px, rnd, grids):
    """Tileable value noise: sum of periodic grids (nx cells across, ny cells down, weight)."""
    def octave(nx, ny):
        g = [[rnd.random() for _ in range(nx)] for _ in range(ny)]

        def f(x, y):
            gx, gy = x * nx / px, y * ny / px
            i, j = int(gx), int(gy)
            tx, ty = gx - i, gy - j
            tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
            a, b = g[j % ny][i % nx], g[j % ny][(i + 1) % nx]
            c, d = g[(j + 1) % ny][i % nx], g[(j + 1) % ny][(i + 1) % nx]
            return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
        return f

    layers = [(octave(nx, ny), w) for nx, ny, w in grids]
    return lambda x, y: sum(f(x, y) * w for f, w in layers)


def concrete_image(name, base, seed, px=256):
    """Raw cement (ปูนเปลือย): tileable cloudy grey with trowel blotches and pinholes."""
    rnd = random.Random(seed)
    v = tile_noise(px, rnd, ((3, 3, 0.45), (7, 7, 0.3), (16, 16, 0.15), (48, 48, 0.1)))
    holes = {(rnd.randrange(px), rnd.randrange(px)) for _ in range(px * px // 900)}
    col = rgb(base)

    def pixel(x, y):
        k = 0.88 + 0.22 * v(x, y) - (0.18 if (x, y) in holes else 0)
        return tuple(min(1.0, c * k) for c in col)
    return make_image(name, px, px, pixel)


def plywood_panel_image(px=256, seed=17):
    """Pine plywood sheet (1.22 m per tile): big flame-like blotches stretched along the grain, a seam on one edge."""
    rnd = random.Random(seed)
    v = tile_noise(px, rnd, ((4, 1, 0.4), (9, 2, 0.3), (24, 4, 0.2), (64, 8, 0.1)))
    col = rgb("#dcbf93")

    def pixel(x, y):
        t = v(x, y)
        k = 1.04 - 0.16 * t - (0.07 if 0.56 < t < 0.6 or 0.68 < t < 0.71 else 0)  # contour rings = the ply figure
        if x < 2:
            k *= 0.72  # seam between sheets
        return tuple(min(1.0, c * k) for c in col)
    return make_image("plywood_panel", px, px, pixel)


def image_mat(name, img, rough=0.6, box_scale=None):
    """Image-textured material. box_scale: read the metre-based box UVs, repeating every 1/box_scale m."""
    key = ("img", name)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    if box_scale:
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (box_scale, box_scale, box_scale)
        nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    _mats[key] = m
    return m


def wood_mat(name):
    """Oak / plywood with a soft generated grain."""
    key = ("wood", name)
    if key in _mats:
        return _mats[key]
    base, amp = rgb(PALETTE[name]), (0.07 if name == "oak" else 0.045)

    def pixel(x, y):  # fine, nearly straight grain lines with a slow drift
        t = 0.5 + 0.5 * sin(y * 0.9 + 0.8 * sin(x * 0.011) + 0.25 * sin(x * 0.07))
        t = t ** 3  # thin darker lines on a calm base
        k = 1 + amp / 2 - amp * t
        return tuple(min(1.0, c * k) for c in base)

    m = image_mat(f"wood_{name}", make_image(f"wood_{name}", 256, 256, pixel), rough=0.6, box_scale=0.8)
    _mats[key] = m
    return m


TAPE_COLOURS = ("#e8483b", "#3c6fd8", "#ffd93b", "#2d2f33", "#f4f2ec", "#5f9a4a", "#f39cc0", "#c9a46c", "#9fd0f2")


def cover_image(i, n=128):
    """Original abstract album covers (no real artwork)."""
    pal = [rgb(c) for c in ("#e8483b", "#3c6fd8", "#ffd93b", "#2d2f33", "#f4f2ec", "#5f9a4a", "#f39cc0", "#ff8a3d", "#9fd0f2")]
    a, b = pal[i % 9], pal[(i * 4 + 3) % 9]

    def pixel(x, y):
        u, v = x / n - 0.5, y / n - 0.5
        r = (u * u + v * v) ** 0.5
        d = i % 9
        if d == 0:
            return b if r < 0.28 else a
        if d == 1:
            return b if int((v + 0.5) * 5) % 2 else a
        if d == 2:
            return b if (r < 0.32 and v < 0.05) else a
        if d == 3:
            return b if ((x % 32 - 16) ** 2 + (y % 32 - 16) ** 2) < 60 else a
        if d == 4:
            return b if u > v else a
        if d == 5:
            return b if int(r * 14) % 2 else a
        if d == 6:
            return b if (-0.1 < u < 0.35 and -0.3 < v < 0.15) else a
        if d == 7:
            return tuple(ca * (0.6 + 0.4 * (u + 0.5)) + cb * 0.4 * (0.5 - u) for ca, cb in zip(a, b))
        return b if (abs(u) < 0.08 or abs(v) < 0.08) else a

    return make_image(f"cover_{i}", n, n, pixel)


def ring(name, R, r, loc, material, parent=None, rot=(0, 0, 0), seg=24, sides=10):
    """Torus in the local XY plane (mug handles and the like)."""
    def build(bm):
        vs = [[bm.verts.new(((R + r * cos(2 * pi * j / sides)) * cos(2 * pi * i / seg),
                             (R + r * cos(2 * pi * j / sides)) * sin(2 * pi * i / seg),
                             r * sin(2 * pi * j / sides))) for j in range(sides)] for i in range(seg)]
        for i in range(seg):
            for j in range(sides):
                bm.faces.new((vs[i][j], vs[(i + 1) % seg][j], vs[(i + 1) % seg][(j + 1) % sides], vs[i][(j + 1) % sides]))

    return _finish(_mesh_obj(name, build, loc, rot), material, 0, parent)


def mug(name, loc, color="white", parent=None):
    g = empty(name, loc, parent=parent)
    cyl(f"{name}_body", 0.05, 0.09, (0, 0, 0.045), mat(color, rough=0.25), parent=g)
    ring(f"{name}_handle", 0.025, 0.007, (0.055, 0, 0.045), mat(color, rough=0.25), parent=g, rot=(90, 0, 0))
    return g


def espresso_machine(name, loc):
    g = empty(name, loc)
    st, blk = mat("steel", rough=0.3, metal=0.8), mat("black", rough=0.5)
    box(f"{name}_body", (0.75, 0.5, 0.45), (0, 0.05, 0.42), st, parent=g, bevel=0.04)
    box(f"{name}_tray", (0.75, 0.32, 0.06), (0, -0.2, 0.06), st, parent=g, bevel=0.01)
    box(f"{name}_grate", (0.62, 0.26, 0.01), (0, -0.2, 0.095), blk, parent=g, bevel=0.002)
    box(f"{name}_cup_rail", (0.7, 0.45, 0.02), (0, 0.05, 0.655), st, parent=g, bevel=0.005)
    for i, x in enumerate((-0.2, 0.0, 0.2)):
        mug(f"{name}_topcup_{i}", (x, 0.05, 0.665), parent=g)
    for i, x in enumerate((-0.18, 0.18)):
        cyl(f"{name}_group_{i}", 0.05, 0.06, (x, -0.22, 0.33), st, parent=g)
        cyl(f"{name}_basket_{i}", 0.045, 0.04, (x, -0.24, 0.28), blk, parent=g)
        box(f"{name}_handle_{i}", (0.03, 0.16, 0.025), (x, -0.36, 0.28), blk, parent=g, bevel=0.008)
        cyl(f"{name}_gauge_{i}", 0.03, 0.01, (x * 0.7, -0.205, 0.55), mat("white"), parent=g, rot=(90, 0, 0))
    cyl(f"{name}_wand", 0.008, 0.25, (0.33, -0.22, 0.27), st, parent=g, rot=(12, 0, 0))
    return g


def cup_shelf(name, loc, w, h, rows=3):
    """Open oak shelf of cafe ware: white cups on saucers, clear glasses, colourful mugs; warm LED strip under each shelf."""
    g = empty(name, loc)
    oak, t, d = mat("oak"), 0.03, 0.25
    step = (h - t) / rows
    for side, x in (("l", -w / 2 + t / 2), ("r", w / 2 - t / 2)):
        box(f"{name}_side_{side}", (t, d, h), (x, 0, h / 2), oak, parent=g, bevel=0.006)
    for k in range(rows + 1):
        box(f"{name}_board_{k}", (w - 2 * t, d, t), (0, 0, t / 2 + k * step), oak, parent=g, bevel=0.005)
    white, glass = mat("white", rough=0.25), mat("glassware", color="#cfe9ee", rough=0.05, metal=0.3, alpha=0.18)
    colours = ("stool_red", "white", "sign", "stool_blue", "white", "leaf")
    n = int((w - 0.2) / 0.16)
    for i in range(rows):
        z = t + i * step  # top of this shelf board
        for j in range(n):
            x = -w / 2 + 0.16 + j * (w - 0.32) / (n - 1)
            if i == 0:  # cups on saucers, every third one stacked two high
                cyl(f"{name}_saucer_{j}", 0.06, 0.012, (x, 0, z + 0.006), white, parent=g)
                for s in range(2 if j % 3 == 0 else 1):
                    cyl(f"{name}_cup_{j}_{s}", 0.038, 0.06, (x, 0, z + 0.042 + s * 0.058), white, parent=g, r2=0.046)
            elif i == 1:  # glasses: tall and short tumblers
                gh = 0.15 if j % 2 else 0.1
                cyl(f"{name}_glass_{j}", 0.036, gh, (x, 0, z + gh / 2), glass, parent=g)
            else:
                mug(f"{name}_mug_{j}", (x, 0, z), colours[j % len(colours)], parent=g)
        box(f"{name}_led_{i}", (w - 2 * t - 0.04, 0.015, 0.008), (0, -d / 2 + 0.02, (i + 1) * step - 0.006),
            mat("led", color="#ffd9a0", emit=3.0), parent=g, bevel=0)
    return g


def speaker(name, loc):
    g = empty(name, loc)
    box(f"{name}_box", (0.24, 0.2, 0.34), (0, 0, 0.17), mat("white"), parent=g, bevel=0.02)
    for i, (z, r) in enumerate(((0.22, 0.06), (0.09, 0.035))):
        cyl(f"{name}_cone_{i}", r, 0.01, (0, -0.103, z), mat("black"), parent=g, rot=(90, 0, 0))
    return g


def plywood_table(name, loc, length, depth, h=0.74):
    """Birch-plywood dining table: thick slab top on two inset plywood panel legs."""
    g = empty(name, loc)
    ply, t = mat("plywood"), 0.035
    box(f"{name}_top", (length, depth, t), (0, 0, h - t / 2), ply, parent=g, bevel=0.006)
    for i, x in enumerate((-length / 2 + 0.3, length / 2 - 0.3)):
        box(f"{name}_leg_{i}", (0.04, depth - 0.3, h - t), (x, 0, (h - t) / 2), ply, parent=g, bevel=0.005)
    return g


def steel_stool(name, loc):
    """Stackable stainless stool: dished round seat, four splayed tube legs, ring brace."""
    g = empty(name, loc)
    steel = mat("steel_polished", color="#c9ccd0", rough=0.18, metal=0.95)
    cyl(f"{name}_seat", 0.165, 0.035, (0, 0, 0.45), steel, parent=g, r2=0.155, bevel=0.014)
    for i, (x, y) in enumerate(((0.1, 0.1), (-0.1, 0.1), (0.1, -0.1), (-0.1, -0.1))):
        cyl(f"{name}_leg_{i}", 0.011, 0.45, (x * 1.15, y * 1.15, 0.215), steel, parent=g, rot=splay(x, y, 8))
    ring(f"{name}_ring", 0.15, 0.007, (0, 0, 0.2), steel, parent=g)
    return g


def turntable(name, loc, label="stool_red", **kw):
    g = empty(name, loc, **kw)
    box(f"{name}_base", (0.6, 0.45, 0.13), (0, 0, 0.065), mat("white"), parent=g, bevel=0.02)
    cyl(f"{name}_disc", 0.19, 0.015, (-0.05, 0, 0.14), mat("black", rough=0.3), parent=g)
    cyl(f"{name}_label", 0.06, 0.017, (-0.05, 0, 0.141), mat(label), parent=g)
    box(f"{name}_arm", (0.035, 0.24, 0.025), (0.2, 0.02, 0.15), mat("steel", rough=0.3, metal=0.8), parent=g, bevel=0.006, rot=(0, 0, 20))
    return g


def splay(x, y, deg=7):
    """Tilt a leg so its foot points away from the centre."""
    return ((1 if y > 0 else -1) * deg, -(1 if x > 0 else -1) * deg, 0)


def shell_chair(name, loc, colour="#e3a52b", rot=(0, 0, 0)):
    """Eames-style moulded shell on oak dowel legs with a steel cross brace. Faces -Y, seat at 0.45."""
    g = empty(name, loc, rot=rot)
    shell, oak, steel = mat(f"shell_{colour}", color=colour, rough=0.45), mat("oak"), mat("steel", rough=0.3, metal=0.8)
    box(f"{name}_seat", (0.46, 0.42, 0.05), (0, 0, 0.45), shell, parent=g, bevel=0.022)
    box(f"{name}_back", (0.46, 0.05, 0.3), (0, 0.22, 0.63), shell, parent=g, bevel=0.022, rot=(-14, 0, 0))
    for i, (x, y) in enumerate(((-0.17, -0.15), (0.17, -0.15), (-0.17, 0.15), (0.17, 0.15))):
        cyl(f"{name}_leg_{i}", 0.016, 0.44, (x * 1.08, y * 1.08, 0.21), oak, parent=g, r2=0.013, rot=splay(x, y))
    for i, r in enumerate((40, -40)):
        box(f"{name}_wire_{i}", (0.44, 0.012, 0.012), (0, 0, 0.2), steel, parent=g, bevel=0.004, rot=(0, 0, r))
    return g


def contract_table(name, loc, r=0.42):
    """Eames-style contract base: black four-star steel base, round oak top at 0.74."""
    g = empty(name, loc)
    blk, steel = mat("black", rough=0.4, metal=0.4), mat("steel", rough=0.3, metal=0.8)
    for i, rz in enumerate((45, -45)):
        box(f"{name}_star_{i}", (0.62, 0.05, 0.03), (0, 0, 0.03), blk, parent=g, bevel=0.012, rot=(0, 0, rz))
    for i, (x, y) in enumerate(((0.21, 0.21), (-0.21, 0.21), (0.21, -0.21), (-0.21, -0.21))):
        cyl(f"{name}_glide_{i}", 0.022, 0.02, (x, y, 0.01), steel, parent=g)
    cyl(f"{name}_column", 0.03, 0.66, (0, 0, 0.36), steel, parent=g)
    cyl(f"{name}_top", r, 0.035, (0, 0, 0.72), mat("oak"), parent=g, bevel=0.012)
    return g


def matcha_station(name, loc):
    """Matcha bar on a tray: dark chawan of whisked matcha, bamboo whisk and scoop, matcha tin, gooseneck kettle, iced matcha latte."""
    g = empty(name, loc)
    bamboo, green, steel = mat("bamboo", color="#d8c08a", rough=0.6), mat("matcha", color="#7fa83a", rough=0.5), mat("steel", rough=0.3, metal=0.8)
    box(f"{name}_tray", (0.62, 0.36, 0.02), (0, 0, 0.01), mat("oak"), parent=g, bevel=0.006)
    t = 0.02  # tray top
    cyl(f"{name}_chawan", 0.05, 0.075, (-0.12, -0.04, t + 0.0375), mat("chawan", color="#2f3b37", rough=0.3), parent=g, r2=0.085)
    cyl(f"{name}_tea", 0.077, 0.006, (-0.12, -0.04, t + 0.066), mat("matcha_foam", color="#9cc35a", rough=0.7), parent=g)
    cyl(f"{name}_whisk_handle", 0.014, 0.06, (0.03, 0.08, t + 0.03), bamboo, parent=g)
    cyl(f"{name}_whisk_tines", 0.018, 0.06, (0.03, 0.08, t + 0.09), bamboo, parent=g, r2=0.034)
    box(f"{name}_scoop", (0.18, 0.014, 0.006), (-0.12, 0.12, t + 0.003), bamboo, parent=g, bevel=0.002, rot=(0, 0, 15))
    cyl(f"{name}_tin", 0.04, 0.09, (0.2, 0.09, t + 0.045), green, parent=g)
    cyl(f"{name}_tin_lid", 0.042, 0.02, (0.2, 0.09, t + 0.1), mat("black"), parent=g)
    cyl(f"{name}_kettle", 0.065, 0.11, (0.2, -0.07, t + 0.055), steel, parent=g, r2=0.055)
    ball(f"{name}_kettle_knob", 0.015, (0.2, -0.07, t + 0.12), mat("black"), parent=g)
    cyl(f"{name}_kettle_spout", 0.007, 0.15, (0.12, -0.07, t + 0.1), steel, parent=g, rot=(0, -55, 0))
    box(f"{name}_kettle_handle", (0.02, 0.02, 0.1), (0.275, -0.07, t + 0.07), mat("black"), parent=g, bevel=0.006)
    # iced matcha latte beside the tray: green under white milk in a clear glass
    cyl(f"{name}_latte_matcha", 0.031, 0.05, (0.4, -0.04, 0.03), green, parent=g)
    cyl(f"{name}_latte_milk", 0.031, 0.05, (0.4, -0.04, 0.08), mat("white"), parent=g)
    cyl(f"{name}_latte_glass", 0.035, 0.12, (0.4, -0.04, 0.06), mat("glass", rough=0.05, alpha=0.25), parent=g)
    return g


def vinyl_shelf(name, loc, cols=3, rows=5, cw=0.4, ch=0.4, d=0.35, seed=5):
    """Plywood cubby wall like an art-book shop, stocked with records: covers face-out, spines filed, flat stacks,
    white trays on the bottom row, a vase of dried flowers on top. loc = bottom centre, depth-centred."""
    g = empty(name, loc)
    rnd = random.Random(seed)
    ply, t = mat("plywood"), 0.02
    W, H = cols * cw + t, rows * ch + t
    box(f"{name}_back", (W, t, H), (0, d / 2 - t / 2, H / 2), ply, parent=g, bevel=0.003)
    for c in range(cols + 1):
        box(f"{name}_side_{c}", (t, d, H + 0.06 * (0 < c < cols)), (-W / 2 + t / 2 + c * cw, 0, (H + 0.06 * (0 < c < cols)) / 2), ply, parent=g, bevel=0.003)
    for r in range(rows + 1):
        box(f"{name}_board_{r}", (W, d, t), (0, 0, t / 2 + r * ch), ply, parent=g, bevel=0.003)
    sleeve = lambda k: image_mat(f"cover_{k % 9}", cover_image(k % 9), rough=0.5)  # noqa: E731
    for r in range(rows):
        z = t + r * ch  # top of this board
        for c in range(cols):
            x0 = -W / 2 + t + c * cw  # left inner edge of the cubby
            xc, k, tag = x0 + (cw - t) / 2, r * cols + c, f"{name}_{r}_{c}"
            if r == 0:  # white archive trays
                box(f"{tag}_tray", (cw - t - 0.04, d - 0.06, 0.09), (xc, -0.01, z + 0.045), mat("white", rough=0.5), parent=g, bevel=0.006)
                continue
            kind = (k * 7 + seed) % 3
            if kind == 0:  # one record face-out, leaning on the back
                box(f"{tag}_face", (0.31, 0.012, 0.31), (xc, d / 2 - t - 0.05, z + 0.16), sleeve(k), parent=g, bevel=0.003, rot=(-8, 0, 0), uv_fit="xz")
            elif kind == 1:  # records filed spine-out, plus one face-out at the end
                n = rnd.randint(8, 14)
                for j in range(n):
                    box(f"{tag}_spine_{j}", (0.012, 0.3, 0.31), (x0 + 0.02 + j * 0.0135, 0, z + 0.155),
                        mat(f"book_{(k + j) % len(BOOK_COLOURS)}", color=BOOK_COLOURS[(k + j) % len(BOOK_COLOURS)], rough=0.6), parent=g, bevel=0.002)
                box(f"{tag}_face", (0.2, 0.012, 0.2), (x0 + 0.04 + n * 0.0135 + 0.11, -0.02, z + 0.11), sleeve(k + 3), parent=g, bevel=0.003, rot=(-12, 0, 0), uv_fit="xz")
            else:  # flat stack with a face-out record propped behind
                for j in range(rnd.randint(3, 6)):
                    box(f"{tag}_flat_{j}", (0.31, 0.31, 0.012), (xc, -0.01, z + 0.006 + j * 0.013), sleeve(k + j), parent=g, bevel=0.002)
                box(f"{tag}_face", (0.31, 0.012, 0.31), (xc, d / 2 - t - 0.04, z + 0.23), sleeve(k + 5), parent=g, bevel=0.003, rot=(-8, 0, 0), uv_fit="xz")
    # top: vase of dried flowers and a couple of records leaning on the back
    cyl(f"{name}_vase", 0.06, 0.22, (W / 2 - 0.25, 0, H + 0.11), mat("white", rough=0.6), parent=g, r2=0.04)
    for j in range(7):
        yaw = j * 51
        cyl(f"{name}_stem_{j}", 0.003, 0.28, (W / 2 - 0.25 + 0.03 * sin(radians(yaw)), 0.03 * cos(radians(yaw)), H + 0.34), mat("dried", color="#cbb98f", rough=0.9), parent=g, rot=(8 * cos(radians(yaw)), 8 * sin(radians(yaw)), 0))
        ball(f"{name}_bloom_{j}", 0.025, (W / 2 - 0.25 + 0.055 * sin(radians(yaw)), 0.055 * cos(radians(yaw)), H + 0.49), mat("dried_bloom", color="#e6dcc2", rough=0.9), parent=g)
    box(f"{name}_top_face", (0.31, 0.012, 0.31), (-W / 2 + 0.25, d / 2 - 0.04, H + 0.16), sleeve(7), parent=g, bevel=0.003, rot=(-10, 0, 0), uv_fit="xz")
    return g


def drinks_fridge(name, loc):
    """Under-counter fridge (counter height): open frame so the lit shelves and bottles show through the glass door."""
    g = empty(name, loc)
    blk = mat("black", rough=0.5)
    for side, x in (("l", -0.375), ("r", 0.375)):
        box(f"{name}_side_{side}", (0.05, 0.7, 1.1), (x, 0, 0.55), blk, parent=g, bevel=0.01)
    box(f"{name}_top", (0.8, 0.7, 0.06), (0, 0, 1.07), blk, parent=g, bevel=0.01)
    box(f"{name}_base", (0.8, 0.7, 0.2), (0, 0, 0.1), blk, parent=g, bevel=0.01)
    box(f"{name}_back", (0.7, 0.03, 0.84), (0, 0.33, 0.62), mat("display", rough=0.5, emit=1.2), parent=g, bevel=0)
    for row, z in enumerate((0.48, 0.76)):
        box(f"{name}_shelf_{row}", (0.7, 0.55, 0.012), (0, 0.02, z), mat("glass", rough=0.05, alpha=0.4), parent=g, bevel=0)
        for k in range(4):
            cyl(f"{name}_bottle_{row}_{k}", 0.04, 0.22, (-0.24 + k * 0.16, 0.0, z + 0.116),
                mat(["stool_red", "leaf", "sign", "stool_blue"][(row + k) % 4], rough=0.35), parent=g)
    box(f"{name}_door", (0.72, 0.02, 0.82), (0, -0.36, 0.62), mat("glass", rough=0.05, alpha=0.18), parent=g, bevel=0)
    box(f"{name}_handle", (0.03, 0.04, 0.4), (0.3, -0.39, 0.62), mat("steel", rough=0.25, metal=0.9), parent=g, bevel=0.008)
    return g


BOOK_COLOURS = ("#c9573f", "#2f4a6b", "#e8d9b5", "#3e6b4a", "#d9a21b", "#2b2b2f", "#f4f2ec", "#8a4b5a", "#9fb7c9", "#c9a46c")


def bookshelf(name, loc, w, h, d, rows=5, seed=7):
    """Open oak bookshelf: books of mixed heights and colours, a lying stack every other row, a leaning book."""
    g = empty(name, loc)
    rnd = random.Random(seed)
    oak, t = mat("oak", rough=0.6), 0.035
    for side, x in (("l", -w / 2 + t / 2), ("r", w / 2 - t / 2)):
        box(f"{name}_side_{side}", (t, d, h), (x, 0, h / 2), oak, parent=g, bevel=0.006)
    box(f"{name}_back", (w, 0.015, h), (0, d / 2 - 0.008, h / 2), mat("plywood", rough=0.7), parent=g, bevel=0)
    step = (h - t) / rows
    for i in range(rows + 1):
        box(f"{name}_shelf_{i}", (w - 2 * t, d, t), (0, 0, t / 2 + i * step), oak, parent=g, bevel=0.005)
    for i in range(rows):
        z0, x, k = t + i * step, -w / 2 + t + 0.01, 0
        right = w / 2 - t - (0.2 if i % 2 == 0 else 0.06)  # leave room for a lying stack on even rows
        while True:
            bw, bh = rnd.uniform(0.025, 0.055), min(step - 0.05, rnd.uniform(0.19, 0.3))
            if x + bw > right:
                break
            col = mat(f"book_{k % len(BOOK_COLOURS)}", color=rnd.choice(BOOK_COLOURS), rough=0.7)
            box(f"{name}_book_{i}_{k}", (bw, rnd.uniform(0.16, 0.21), bh), (x + bw / 2, -0.02, z0 + bh / 2), col, parent=g, bevel=0.004)
            x, k = x + bw + 0.002, k + 1
        if i % 2 == 0:  # lying stack in the gap
            for j in range(3):
                box(f"{name}_stack_{i}_{j}", (0.16, 0.2, 0.035), (right + 0.1, -0.02, z0 + 0.018 + j * 0.036),
                    mat(f"stackbook_{j}", color=BOOK_COLOURS[(i + j * 3) % len(BOOK_COLOURS)], rough=0.7), parent=g, bevel=0.004, rot=(0, 0, j * 4))
        else:  # one book leaning against the side
            box(f"{name}_lean_{i}", (0.035, 0.19, 0.27), (right + 0.01, -0.02, z0 + 0.13),
                mat("book_lean", color="#c9573f", rough=0.7), parent=g, bevel=0.004, rot=(0, -12, 0))
    return g


def chalkboard(name, loc, w, h, rot=(0, 0, 0)):
    """Guestbook board: visitors hand-write on it (hotspot 'guestbook'). Built facing -Y, bottom edge at loc."""
    g = empty(name, loc, hotspot="guestbook", rot=rot)
    box(f"{name}_frame", (w + 0.08, 0.04, h + 0.08), (0, 0, h / 2), mat("oak"), parent=g, bevel=0.01)
    box(f"{name}_panel", (w, 0.045, h), (0, -0.005, h / 2), mat("board_blue", color="#2b4c8c", rough=0.9), parent=g, bevel=0.002)  # blank, waiting for visitors
    box(f"{name}_tray", (w, 0.08, 0.025), (0, -0.05, -0.02), mat("oak"), parent=g, bevel=0.006)
    for i, (x, col) in enumerate(((-0.3, "white"), (-0.22, "stool_red"), (0.4, "sign"))):
        cyl(f"{name}_chalk_{i}", 0.009, 0.08, (x, -0.06, -0.0), mat(f"chalk_{col}", color=PALETTE[col], rough=0.9),
            parent=g, rot=(0, 90, 0))
    return g


def dracaena(name, loc, scale=1.0):
    """Tall thin trunks topped with arching blade-shaped leaves."""
    g = empty(name, loc)
    cyl(f"{name}_pot", 0.2 * scale, 0.4 * scale, (0, 0, 0.2 * scale), mat("concrete_dark", rough=0.8), parent=g, r2=0.17 * scale)
    half = 0.24 * scale
    for i, (dx, h) in enumerate(((0.0, 1.5), (0.07, 1.15), (-0.06, 0.95))):
        top = (0.4 + h) * scale
        cyl(f"{name}_trunk_{i}", 0.018 * scale, h * scale, (dx * scale, 0, (0.4 + h / 2) * scale), mat("pot", rough=0.8), parent=g)
        for k in range(10):
            tilt, yaw = (35 if k % 2 else 62), k * 36 + i * 17
            off = Euler((radians(tilt), 0, radians(yaw)), "XYZ").to_matrix() @ Vector((0, 0, half))
            ball(f"{name}_leaf_{i}_{k}", 1.0, (dx * scale + off.x, off.y, top + off.z), mat("leaf" if k % 2 else "leaf_dark", rough=0.7),
                 parent=g, scale=(0.012 * scale, 0.045 * scale, half), rot=(tilt, 0, yaw))
    return g


def bird_of_paradise(name, loc):
    """Long stems fanning forward and sideways (not into the wall) with banana-like paddle leaves, dark concrete pot."""
    g = empty(name, loc)
    cyl(f"{name}_pot", 0.22, 0.42, (0, 0, 0.21), mat("concrete_dark", rough=0.8), parent=g, r2=0.2)
    soil = Vector((0, 0, 0.42))

    def out(tilt, yaw, length):  # yaw 0 leans toward -Y (the street)
        return Euler((radians(tilt), 0, radians(yaw)), "XYZ").to_matrix() @ Vector((0, 0, length))

    for k, (tilt, yaw, s) in enumerate(((8, 0, 0.95), (22, 65, 0.75), (20, -65, 0.85), (26, 115, 0.65), (18, -35, 0.8), (12, 30, 1.05))):
        cyl(f"{name}_stem_{k}", 0.012, s, tuple(soil + out(tilt, yaw, s / 2)), mat("leaf", rough=0.7), parent=g, rot=(tilt, 0, yaw))
        c = soil + out(tilt, yaw, s) + out(tilt + 10, yaw, 0.28)
        ball(f"{name}_leaf_{k}", 1.0, tuple(c), mat("leaf_dark" if k % 2 else "leaf", rough=0.6), parent=g,
             scale=(0.1, 0.014, 0.28), rot=(tilt + 10, 0, yaw))
    return g


def snake_plant(name, loc):
    """Snake plant: upright blades with yellow edges in a tall matte-black cylinder."""
    g = empty(name, loc)
    cyl(f"{name}_pot", 0.17, 0.45, (0, 0, 0.225), mat("black", rough=0.7), parent=g)
    rnd = random.Random(4)
    for k in range(11):
        yaw, r = radians(k * 137.5), 0.04 + 0.08 * rnd.random()
        x, y = r * sin(yaw), -r * cos(yaw)
        h, tilt = rnd.uniform(0.38, 0.6), rnd.uniform(-8, 8)
        ball(f"{name}_blade_{k}", 1.0, (x, y, 0.45 + h), mat("snake", color="#3f6b3a", rough=0.6),
             parent=g, scale=(0.045, 0.012, h), rot=(tilt, 0, k * 137.5))
        ball(f"{name}_edge_{k}", 1.0, (x, y, 0.45 + h * 0.95), mat("snake_edge", color="#d8c45a", rough=0.6),
             parent=g, scale=(0.05, 0.008, h * 0.9), rot=(tilt, 0, k * 137.5))
    return g


def mushroom(name, loc, cap_col):
    g = empty(name, loc)
    cyl(f"{name}_stem", 0.045, 0.12, (0, 0, 0.06), mat("white"), parent=g)
    ball(f"{name}_cap", 0.09, (0, 0, 0.13), mat(cap_col, rough=0.5), parent=g, scale=(1, 1, 0.6))
    return g


def serving_spot(name, loc):
    """Pickup point on the L return, facing the walkway (+X): tray of ready drinks, bell, PICK UP card, straws."""
    g = empty(name, loc)
    box(f"{name}_tray", (0.32, 0.42, 0.02), (0, 0, 0.01), mat("oak"), parent=g, bevel=0.006)
    mug(f"{name}_latte_0", (-0.06, -0.1, 0.02), parent=g)
    mug(f"{name}_latte_1", (-0.06, 0.08, 0.02), parent=g)
    cyl(f"{name}_togo", 0.04, 0.13, (0.08, 0.1, 0.085), mat("white", rough=0.4), parent=g, r2=0.05)
    cyl(f"{name}_togo_lid", 0.052, 0.015, (0.08, 0.1, 0.157), mat("black", rough=0.5), parent=g)
    cyl(f"{name}_togo_sleeve", 0.047, 0.04, (0.08, 0.1, 0.08), mat("plywood", color="#c9a46c", rough=0.8), parent=g, r2=0.049)
    cyl(f"{name}_bell_base", 0.045, 0.012, (0.08, 0.38, 0.006), mat("black"), parent=g)
    ball(f"{name}_bell", 0.04, (0.08, 0.38, 0.012), mat("steel", rough=0.15, metal=1.0), parent=g, scale=(1, 1, 0.75))
    cyl(f"{name}_bell_knob", 0.008, 0.02, (0.08, 0.38, 0.05), mat("steel", rough=0.15, metal=1.0), parent=g)
    card = empty(f"{name}_card", (0.24, 0.3, 0.0), parent=g)
    box(f"{name}_card_board", (0.012, 0.22, 0.11), (0, 0, 0.065), mat("white"), parent=card, bevel=0.003)
    text(f"{name}_card_text", "PICK UP", 0.04, (0.008, 0, 0.065), mat("ink", rough=0.6), parent=card, extrude=0.001,
         fonts=SIGN_FONTS, rot=(90, 0, 90), align="CENTER")
    cyl(f"{name}_straw_jar", 0.03, 0.09, (-0.08, 0.36, 0.045), mat("glass", rough=0.05, alpha=0.35), parent=g)
    for k, (dx, dy, col) in enumerate(((-0.01, 0.0, "stool_red"), (0.01, 0.01, "sign"), (0.0, -0.012, "stool_blue"))):
        cyl(f"{name}_straw_{k}", 0.004, 0.16, (-0.08 + dx, 0.36 + dy, 0.1), mat(col, rough=0.4), parent=g)
    return g


def build_interior():
    use_collection("Interior")
    steel = mat("steel", rough=0.35, metal=0.6)
    wall = mat("wall", rough=0.85)  # white walls and a smooth white ceiling
    floor = image_mat("concrete_floor", concrete_image("concrete_floor", "#aeadaa", seed=23), rough=0.55, box_scale=1 / 1.5)  # raw cement
    box("in_floor", (6.2 + EXTRA_W, 4.0, 0.05), (EXTRA_W / 2, 2.4, 0.175), floor, bevel=0)
    box("in_backwall", (6.2 + EXTRA_W, 0.2, 3.6), (EXTRA_W / 2, 4.4, 1.95), wall, bevel=0)
    box("in_ceiling", (6.2 + EXTRA_W, 4.0, 0.1), (EXTRA_W / 2, 2.4, 3.7), wall, bevel=0)
    # left wall behind the bar: pine plywood sheets (1.22 m wide); right wall white (the board hangs there)
    box("in_wall_left", (0.1, 4.0, 3.6), (-3.15, 2.4, 1.95), image_mat("plywood_panel", plywood_panel_image(), rough=0.7, box_scale=1 / 1.22), bevel=0)
    box("in_wall_right", (0.1, 4.0, 3.6), (3.15 + EXTRA_W, 2.4, 1.95), wall, bevel=0)
    for i, y in enumerate((2.0, 3.6)):
        cyl(f"in_pipe_{i}", 0.05, 6.0 + EXTRA_W, (EXTRA_W / 2, y, 3.55), mat("steel", rough=0.5, metal=0.5), rot=(0, 90, 0))

    # --- left: the counter you stand behind, seen through the open window
    # one-piece L counter: front leg right behind the display case, short return toward the back
    prism("counter_body", [(-2.9, 0.35), (0.15, 0.35), (0.15, 2.45), (-0.45, 2.45), (-0.45, 1.05), (-2.9, 1.05)],
          0.2, 1.1, mat("plywood"), bevel=0.02)
    prism("counter_top", [(-2.95, 0.3), (0.2, 0.3), (0.2, 2.5), (-0.5, 2.5), (-0.5, 1.1), (-2.95, 1.1)],
          1.3, 0.05, steel, bevel=0.01)
    espresso_machine("espresso", (-2.2, 0.8, 1.35))
    cyl("grinder", 0.1, 0.35, (-1.6, 0.85, 1.525), mat("black"))
    cyl("grinder_hopper", 0.06, 0.18, (-1.6, 0.85, 1.79), mat("glass", rough=0.05, alpha=0.25), r2=0.11)
    for i, x in enumerate((-1.3, -1.17)):
        cyl(f"cup_stack_{i}", 0.065, 0.34, (x, 0.5, 1.52), mat("white"), r2=0.055)
    matcha_station("matcha", (-0.62, 0.75, 1.35))
    serving_spot("serve", (-0.15, 1.6, 1.35))

    # you, behind the counter (placeholder: refine by hand)
    # raised duckboard behind the counter, so your face shows through the window and you don't float
    box("staff_platform", (2.35, 1.1, 0.55), (-1.675, 1.6, 0.475), mat("plywood"), bevel=0.02)  # inside the L; tall so your chest clears the street ledge (2.1 m)
    me = empty("HOT_character", (-1.0, 1.45, 0.75), hotspot="about")
    me.scale = (1.15, 1.15, 1.15)  # ponytail: toy-scale up so you read from the street; counters sit at knee height inside
    # clay-figure style (ref: smooth matte people, dot eyes, tiny nose, small open mouth, real proportions).
    # Body = one skin skeleton; tee and jeans = slightly fatter skeletons over it; head = fused clay pieces.
    skin, tee, jeans = mat("skin", rough=0.6), mat("tshirt", color="#3f73d6", rough=0.75), mat("jeans", color="#1f2d4d", rough=0.8)
    hair = mat("hair", rough=0.8)

    def side(sx, pts):  # mirror a list of (x, y, z, rx, ry) to one side
        return [(sx * x, y, z, rx, ry) for x, y, z, rx, ry in pts]

    arm = [(0.18, 0.0, 1.47, 0.06, 0.055), (0.228, 0.0, 1.33, 0.052, 0.05), (0.25, 0.01, 1.16, 0.044, 0.042),
           (0.258, -0.03, 0.94, 0.034, 0.03), (0.262, -0.04, 0.86, 0.045, 0.025), (0.264, -0.045, 0.8, 0.036, 0.02),
           (0.24, -0.066, 0.89, 0.017, 0.017)]  # shoulder, upper arm, elbow, wrist, palm, fingertips, thumb
    core = [(0, 0, 1.0, 0.1, 0.07), (0, 0, 1.18, 0.11, 0.07), (0, 0, 1.36, 0.12, 0.075),
            (0, 0, 1.5, 0.065, 0.065), (0, 0, 1.62, 0.06, 0.06)]  # pelvis, waist, chest, neck base, neck top (thin: clothes cover it)

    def skeleton(core_n, arm_pts, leg_pts, sides=(-1, 1)):
        joints, bones = list(core[:core_n]), [(i, i + 1) for i in range(core_n - 1)]
        for sx in sides:
            if arm_pts:
                base = len(joints)
                joints += side(sx, arm_pts)
                bones += [(min(2, core_n - 1), base)] + [(base + k, base + k + 1) for k in range(len(arm_pts) - 1)]
                if len(arm_pts) == 7:
                    bones[-1] = (base + 3, base + 6)  # thumb branches off the wrist
        return joints, bones

    body = skin_body("char_body", *skeleton(5, arm, None), skin, me)  # one piece: torso, neck, both arms (legs are all jeans)
    # tee: rounded-box torso with a flat hem + short sleeves grown from the shoulders, fused into one soft piece
    tee_parts = [box("char_tee_torso", (0.38, 0.23, 0.62), (0, 0, 1.2), tee, parent=me, bevel=0.1)]
    core = [(0, 0, 1.4, 0.12, 0.1)]
    sleeve = [(x, y, z, rx + 0.03, ry + 0.028) for x, y, z, rx, ry in arm[:2]]
    tee_parts.append(skin_body("char_tee_sleeves", *skeleton(1, sleeve, None), tee, me))
    shirt = fuse("char_tee", tee_parts, tee, me, voxel=0.006, smooth=6)
    rig_character(body, shirt, me, wave_shoulder=(-arm[0][0], arm[0][1], arm[0][2]), wave_elbow=(-arm[2][0], arm[2][1], arm[2][2]))
    # jeans: rounded-box hips + two straight wide legs, fused
    jeans_parts = [box("char_jeans_hips", (0.34, 0.21, 0.22), (0, 0, 0.92), jeans, parent=me, bevel=0.08)]
    for i, sx in enumerate((-1, 1)):
        jeans_parts.append(cyl(f"char_jeans_leg_{i}", 0.074, 0.86, (sx * 0.09, 0, 0.5), jeans, parent=me, r2=0.082, bevel=0.02))
    fuse("char_jeans", jeans_parts, jeans, me, voxel=0.006, smooth=6)
    for i, x in enumerate((-0.1, 0.1)):
        ball(f"char_shoe_{i}", 0.07, (x, -0.035, 0.05), mat("white", rough=0.5), parent=me, scale=(1, 1.6, 0.75))
    # head on a neck pivot (char_head_pivot) so the page can turn it toward the viewer
    hp = empty("char_head_pivot", (0, 0, 1.58), parent=me)
    H = lambda x, y, z: (x, y, z - 1.58)  # noqa: E731  head-space coordinates
    head = [ball("char_head", 0.155, H(0, 0, 1.73), skin, parent=hp, scale=(1.0, 0.95, 1.1)),
            ball("char_cheeks", 0.15, H(0, -0.01, 1.67), skin, parent=hp, scale=(1.0, 0.92, 0.78)),
            ball("char_nose", 0.02, H(0, -0.145, 1.71), skin, parent=hp, scale=(1, 0.8, 1))]
    for i, s_ in enumerate((-1, 1)):
        head.append(ball(f"char_ear_{i}", 0.032, H(s_ * 0.152, 0.0, 1.72), skin, parent=hp, scale=(0.5, 0.8, 1.1)))
    fuse("char_head_clay", head, skin, hp, voxel=0.005)
    # your hair: dark messy mop with choppy heavy bangs down to the brows
    mop = [ball("char_hair", 0.16, H(0, 0.012, 1.81), hair, parent=hp, scale=(1.04, 1.02, 0.78)),
           ball("char_hair_back", 0.155, H(0, 0.03, 1.73), hair, parent=hp, scale=(1.05, 0.95, 0.85))]
    for k in range(11):  # strands tucked under the cap, uneven tips over the forehead
        a = radians(-70 + k * 14)
        L = (0.044, 0.036, 0.05, 0.04)[k % 4]
        mop.append(ball(f"char_bang_{k}", 1.0, H(0.146 * sin(a), -0.146 * cos(a), 1.775 + L), hair, parent=hp,
                        scale=(0.026, 0.014, L), rot=((-1) ** k * 7, 0, degrees(a))))
    fuse("char_hair", mop, hair, hp, voxel=0.005, smooth=4)
    for i, s_ in enumerate((-1, 1)):
        ball(f"char_eye_{i}", 0.017, H(s_ * 0.052, -0.145, 1.74), mat("black", rough=0.3), parent=hp, scale=(1, 0.5, 1.3))
        ball(f"char_eye_glint_{i}", 0.005, H(s_ * 0.052 + 0.005, -0.153, 1.748), mat("white", rough=0.2), parent=hp)
    # small open "D" mouth like the reference figures: flat top edge, round bottom, bright red
    d = [(-0.022 + 0.044 * k / 8, 0.0) for k in range(9)][::-1] + [(0.022 * cos(radians(a_)), -0.017 * sin(radians(a_))) for a_ in range(160, 0, -20)]
    mouth = prism("char_mouth", d, 0, 0.012, mat("mouth", color="#a3262a", rough=0.45), parent=hp, bevel=0.003)
    mouth.location, mouth.rotation_euler = H(0, -0.137, 1.652), (radians(90), 0, 0)  # extrudes toward the viewer

    # cup shelf behind you, speakers and little friends on top
    cup_shelf("cup_shelf", (-1.6, 4.12, 1.95), 2.4, 1.3)
    drinks_fridge("fridge", (-2.3, 3.93, 0.2))  # staff side, against the back wall under the cup shelf
    for i, x in enumerate((-2.55, -0.65)):
        speaker(f"speaker_{i}", (x, 4.1, 3.25))
    for i, (x, col) in enumerate(((-1.45, "stool_blue"), (-1.28, "white"))):
        mushroom(f"mushroom_{i}", (x, 4.1, 3.25), col)
    ball("cactus_buddy", 0.11, (-1.85, 4.1, 3.405), mat("leaf", rough=0.5), scale=(1, 1, 1.4))
    for i, x in enumerate((-1.885, -1.815)):
        ball(f"cactus_eye_{i}", 0.013, (x, 3.995, 3.44), mat("black"))

    # warm globe pendants
    for i, (x, y) in enumerate(((-0.45, 2.4), (2.1, 2.65))):
        ball(f"pendant_globe_{i}", 0.22, (x, y, 3.15), mat("pendant", color="#ffe2b0", rough=0.4, emit=5.0))
        cyl(f"pendant_cord_{i}", 0.01, 0.3, (x, y, 3.52), mat("black"))

    # --- right: plywood centre table with steel stools, vinyl wall, records, plants
    plywood_table("center_table", (2.1, 2.65, 0.2), 1.8, 0.85)  # like the reference: birch ply, panel legs, steel stools
    for i, (x, y) in enumerate(((1.6, 2.0), (2.6, 2.0), (1.6, 3.3), (2.6, 3.3))):
        steel_stool(f"stool_steel_{i}", (x, y, 0.2))
    turntable("HOT_record", (1.55, 2.65, 0.94), label="sign", hotspot="music")  # click to play / stop the music
    bookshelf("bookshelf", (0.95, 4.1, 0.2), 0.9, 2.2, 0.35)
    vinyl_shelf("vinyl_shelf", (2.08, 4.125, 0.2))  # back wall next to the bookshelf: plywood cubbies of records
    chalkboard("HOT_board", (4.9, 1.75, 1.3), 1.5, 1.0, rot=(0, 0, -90))  # right wall, first thing you pass inside the door
    dracaena("dracaena", (0.1, 3.95, 0.2), 1.0)  # back wall, left of the bookshelf
    bird_of_paradise("bird_of_paradise", (3.15, 3.85, 0.2))  # back wall, between the record crates and the mid-century corner
    # mid-century corner (back right): round contract-base table tucked into the corner, two shell chairs on the open sides
    cx, cy = 4.42, 3.77
    contract_table("mcm_table", (cx, cy, 0.2))
    for i, a in enumerate((180, 270)):
        shell_chair(f"mcm_chair_{i}", (cx + 0.62 * cos(radians(a)), cy + 0.62 * sin(radians(a)), 0.2), rot=(0, 0, a - 90))
    snake_plant("snake_plant", (0.85, 0.7, 0.2))  # in the gap left by the shorter seating

    # window seating like the reference cafe: oak plank table along the glass + bench behind it
    seat_len = 0.2 + EXTRA_W  # shortened from the left: the freed gap by the window holds the snake plant
    seat_x = 3.3 - seat_len / 2
    plank_bench("window_table", (seat_x, 0.45, 0.2), seat_len, 0.72, 0.36)
    plank_bench("window_bench", (seat_x, 0.98, 0.2), seat_len, 0.45, 0.32)
    cyl("mini_pot", 0.045, 0.06, (seat_x + 0.5, 0.45, 0.975), mat("pot", rough=0.8))
    ball("mini_plant", 0.05, (seat_x + 0.5, 0.45, 1.04), mat("leaf", rough=0.7), scale=(1, 1, 1.2))

    # warm spotlights on the cup shelf and the vinyl wall
    for i, (x, y) in enumerate(((-2.2, 3.2), (-1.0, 3.2), (2.1, 3.4))):
        sd = bpy.data.lights.new(f"spot_{i}", type="SPOT")
        sd.energy, sd.color = 60, (1.0, 0.8, 0.55)
        sd.spot_size, sd.spot_blend = radians(55), 0.5
        so = bpy.data.objects.new(f"spot_{i}", sd)
        so.location, so.rotation_euler = (x, y, 3.6), (radians(35), 0, 0)
        _coll["current"].objects.link(so)

    interior_light = bpy.data.lights.new("interior_area", type="AREA")
    interior_light.shape = "RECTANGLE"
    interior_light.size, interior_light.size_y = 5.0 + EXTRA_W, 3.0
    interior_light.color = (1.0, 0.76, 0.52)  # warm amber inside, cool daylight outside
    obj = bpy.data.objects.new("interior_area", interior_light)
    obj.location = (EXTRA_W / 2, 2.4, 3.6)
    _coll["current"].objects.link(obj)
    return interior_light


# ---------------------------------------------------------------- projects on the shelf

SLOT_POSITIONS = [(-2.5, 0.0, 1.175), (-1.5, 0.0, 1.175), (-0.5, 0.0, 1.175),
                  (-2.5, 0.0, 0.425), (-1.5, 0.0, 0.425), (-0.5, 0.0, 0.425)]


def ipod_classic(parent, pid):
    """iPod classic (black), oversized toy scale: real 61.8 x 103.5 x 10.5 mm, here x6."""
    body = box(f"{pid}_body", (0.37, 0.065, 0.62), (0, 0, 0.33), mat("ipod", rough=0.35, metal=0.6), parent=parent, bevel=0.04, rot=(-8, 0, 0))
    box(f"{pid}_screen", (0.29, 0.008, 0.22), (0, -0.033, 0.155), mat("ipod_screen", rough=0.3, emit=1.2), parent=body, bevel=0.006)
    cyl(f"{pid}_wheel", 0.12, 0.008, (0, -0.033, -0.13), mat("ipod_wheel", rough=0.5), parent=body, rot=(90, 0, 0), bevel=0.003)
    cyl(f"{pid}_button", 0.045, 0.01, (0, -0.036, -0.13), mat("ipod", rough=0.35, metal=0.6), parent=body, rot=(90, 0, 0), bevel=0.003)
    box(f"{pid}_label", (0.26, 0.02, 0.07), (0, -0.2, 0.035), mat("white"), parent=parent, bevel=0.006, rot=(-20, 0, 0))


PROJECT_BUILDERS = {"ipod_classic": ipod_classic}


def build_projects():
    use_collection("Projects")
    for i, (x, y, z) in enumerate(SLOT_POSITIONS):
        slot = empty(f"SLOT_{i + 1:02d}", (x, y, z))
        if i < len(PROJECTS):
            p = PROJECTS[i]
            holder = empty(f"HOT_project_{p['id']}", (0, 0, 0), parent=slot, hotspot=f"project:{p['id']}")
            holder["url"] = p["url"]
            PROJECT_BUILDERS[p["builder"]](holder, p["id"])
        else:
            box(f"SLOT_{i + 1:02d}_riser", (0.3, 0.22, 0.04), (0, 0, 0.02), mat("plywood", rough=0.7), parent=slot, bevel=0.01)


# ---------------------------------------------------------------- light, camera, render

def build_rig(time, interior_light):
    use_collection("Rig")
    p = PRESETS[time]
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = p["sun"]
    sun_data.angle = radians(1.5)  # small angle = crisp toy shadows
    sun_data.color = p["sun_color"]
    sun = bpy.data.objects.new("Sun", sun_data)
    sun.rotation_euler = [radians(a) for a in p["sun_rot"]]
    _coll["current"].objects.link(sun)
    interior_light.energy = p["interior"]

    for node, base in _emissive:
        set_input(node, ("Emission Strength",), base * p["emit"])

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = lin(p["world"])
    bg.inputs[1].default_value = p["world_k"]
    # glossy rays see Blender's bundled city HDRI so polished metal has something to mirror
    hdri = bpy.utils.system_resource("DATAFILES", path="studiolights/world/city.exr")
    if hdri and os.path.exists(hdri):
        nt = world.node_tree
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri, check_existing=True)
        refl = nt.nodes.new("ShaderNodeBackground")
        refl.inputs[1].default_value = p["refl"]
        path = nt.nodes.new("ShaderNodeLightPath")
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(env.outputs["Color"], refl.inputs[0])
        nt.links.new(path.outputs["Is Glossy Ray"], mix.inputs["Fac"])
        nt.links.new(bg.outputs[0], mix.inputs[1])
        nt.links.new(refl.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], nt.nodes["World Output"].inputs["Surface"])
    bpy.context.scene.world = world

    cam_data = bpy.data.cameras.new("CAM_front")
    cam_data.lens = 50  # long lens, near-frontal toy look
    cam = bpy.data.objects.new("CAM_front", cam_data)
    cam.location = (EXTRA_W / 2, -17.5, 2.9)
    cam.rotation_euler = (radians(89), 0, 0)
    _coll["current"].objects.link(cam)
    bpy.context.scene.camera = cam
    close_data = bpy.data.cameras.new("CAM_close")
    close_data.lens = 35
    close = bpy.data.objects.new("CAM_close", close_data)
    close.location = (EXTRA_W / 2 - 0.3, -7.5, 2.0)
    close.rotation_euler = (radians(87), 0, 0)
    _coll["current"].objects.link(close)

    # interior views (for checking the shop; the website never goes inside)
    for name, loc, rot, lens in (
        ("CAM_inside_back", (1.6, 0.75, 1.45), (88, 0, 0), 20),               # from the window seat toward the back wall
        ("CAM_inside_counter", (3.4 + EXTRA_W / 2, 2.6, 1.6), (84, 0, 90), 22),  # from the right, looking across at the counter
        ("CAM_inside_window", (3.9, 3.9, 1.7), (82, 0, 127), 20),             # back corner toward the glass and street
    ):
        data = bpy.data.cameras.new(name)
        data.lens = lens
        obj = bpy.data.objects.new(name, data)
        obj.location = loc
        obj.rotation_euler = [radians(a) for a in rot]
        _coll["current"].objects.link(obj)

    # walk path the website camera follows (street -> shop front)
    cu = bpy.data.curves.new("PATH_walk", type="CURVE")
    cu.dimensions = "3D"
    sp = cu.splines.new("POLY")
    pts = [(-14, -6.5, 1.6), (-8, -6.2, 1.6), (-3, -5.6, 1.6), (EXTRA_W / 2, -4.4, 1.6)]
    sp.points.add(len(pts) - 1)
    for pt, co in zip(sp.points, pts):
        pt.co = (*co, 1.0)
    _coll["current"].objects.link(bpy.data.objects.new("PATH_walk", cu))

    # optional walk-in route: door -> up the right side -> along the front of the oak counter
    cu2 = bpy.data.curves.new("PATH_inside", type="CURVE")
    cu2.dimensions = "3D"
    sp2 = cu2.splines.new("POLY")
    pts2 = [(2.36 + EXTRA_W, -1.0, 1.6), (4.05, 0.9, 1.6), (3.4, 1.75, 1.6), (2.1, 1.75, 1.6)]
    sp2.points.add(len(pts2) - 1)
    for pt, co in zip(sp2.points, pts2):
        pt.co = (*co, 1.0)
    _coll["current"].objects.link(bpy.data.objects.new("PATH_inside", cu2))


def setup_render():
    s = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            s.render.engine = engine
            break
        except TypeError:
            continue
    s.render.resolution_x, s.render.resolution_y = 1600, 1200
    try:
        s.eevee.use_raytracing = True  # screen-space reflections on the metal and glass
    except AttributeError:
        pass
    s.view_settings.exposure = 0.0
    for vt in ("Standard",):  # keeps saturated toy colours; AgX washed the sign out
        try:
            s.view_settings.view_transform = vt
            break
        except TypeError:
            continue
    for look in ("Medium High Contrast", "None"):
        try:
            s.view_settings.look = look
            break
        except TypeError:
            continue


# ---------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--time", choices=PRESETS.keys(), default="day")
    ap.add_argument("--out")
    ap.add_argument("--render")
    ap.add_argument("--cam", choices=("front", "close", "inside_back", "inside_counter", "inside_window"), default="front")
    args = ap.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    _emissive.clear()

    build_street()
    build_building()
    build_storefront()
    interior_light = build_interior()
    build_projects()
    build_rig(args.time, interior_light)
    bpy.context.scene.camera = bpy.data.objects["CAM_" + args.cam]
    setup_render()

    if args.out:
        bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(args.out))
    if args.render:
        bpy.context.scene.render.filepath = bpy.path.abspath(args.render)
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
