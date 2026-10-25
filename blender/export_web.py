"""Export the built storefront for the website: web/storefront.glb + web/rig.json.

Run after build_storefront.py has saved a .blend:
  blender -b out/storefront_day.blend -P blender/export_web.py -- web
"""
import json
import os
import sys

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

out_dir = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
os.makedirs(out_dir, exist_ok=True)
dg = bpy.context.evaluated_depsgraph_get()

# glTF has no text objects: bake the sign and card text into meshes
for ob in [o for o in bpy.data.objects if o.type == "FONT"]:
    ob.data.resolution_u, ob.data.bevel_resolution = 3, 1  # letters read the same with far fewer curve steps
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    new = bpy.data.objects.new(ob.name, me)
    new.parent = ob.parent  # keep sign text attached to its board
    new.matrix_world = ob.matrix_world
    for c in ob.users_collection:
        c.objects.link(new)
    bpy.data.objects.remove(ob)
    new.name = new.name.replace(".001", "")

# the clay character is voxel-remeshed (~100k faces): thin it out for the web
for ob in bpy.data.objects:
    if ob.type == "MESH" and ob.name in ("char_jeans", "char_tee", "char_hair", "char_head_clay"):
        d = ob.modifiers.new("WebDecimate", "DECIMATE")
        d.ratio = 0.15
        ob.modifiers.move(len(ob.modifiers) - 1, 0)  # before the armature, so the rigged tee keeps its skin weights


def smooth_character(ch):
    """One level of subdivision rounds off his low-poly arms and legs (Meshy: ~10k tris). Edges where the texture
    changes colour (skin to sleeve, shirt to jeans, hair to face) are creased so the colour borders stay where the
    texture painted them; without that the sleeves go ragged."""
    import numpy as np
    me = ch.data
    img = next(n.image for n in ch.material_slots[0].material.node_tree.nodes
               if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for l in n.outputs[0].links))
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    cls = np.empty(len(me.polygons), np.int8)  # each face's colour at its centre: hair, jeans, shirt or skin
    for f in me.polygons:
        c = uv[f.loop_start:f.loop_start + f.loop_total].mean(0)
        r, g, b = px[min(int(c[1] * h), h - 1), min(int(c[0] * w), w - 1), :3]
        v = max(r, g, b)
        cls[f.index] = 0 if v < 0.3 else (1 if b > r + 0.1 and v < 0.45 else (2 if b > r + 0.1 else 3))
    faces_of = {}
    for f in me.polygons:
        for k in f.edge_keys:
            faces_of.setdefault(k, []).append(f.index)
    vals = np.array([1.0 if len(fs := faces_of.get(e.key, [])) == 2 and cls[fs[0]] != cls[fs[1]] else 0.0
                     for e in me.edges], np.float32)
    crease = me.attributes.get("crease_edge") or me.attributes.new("crease_edge", "FLOAT", "EDGE")
    crease.data.foreach_set("value", vals)
    s = ch.modifiers.new("WebSmooth", "SUBSURF")
    s.levels = s.render_levels = 1
    s.uv_smooth = "PRESERVE_BOUNDARIES"  # smoothing the UVs inside the face too pulls his mouth into a frown
    ch.modifiers.move(len(ch.modifiers) - 1, 0)  # before the armature, so it keeps the skin weights


# paint_face, in the mesh's own metres: the eye band's height, how far a hem's lip stands out from the skin to count as
# shirt, and how many texels to pad repainted patches into the gutter around them
EYE_Y = (1.455, 1.503)  # the eye; the fringe starts at 1.505, and that stays as Meshy painted it
LIP = 0.004
PAD = 8


def paint_face(ch):
    """Touch-ups painted straight into his textures, in 3D on the smoothed mesh the GLB carries: his right eye (Meshy
    drew it ragged, with a pale streak) becomes a mirror image of his left, and the neckline and sleeves get clean edges."""
    arm = [m for m in ch.modifiers if m.type == "ARMATURE"]
    for m in arm:
        m.show_viewport = False
    me = ch.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    for m in arm:
        m.show_viewport = True
    me.calc_loop_triangles()
    co = np.array([v.co[:] for v in me.vertices])
    uvd = me.uv_layers.active.data
    T = [(tuple(t.vertices), [uvd[l].uv[:] for l in t.loops]) for t in me.loop_triangles]
    tv = np.array([t[0] for t in T]); tuv = np.array([t[1] for t in T])  # (n,3) (n,3,2)
    cen = co[tv].mean(1)
    bvh = BVHTree.FromPolygons([tuple(c) for c in co], [tuple(t) for t in tv])
    nodes = ch.material_slots[0].material.node_tree.nodes
    imgs = sorted((n.image for n in nodes if n.type == "TEX_IMAGE" and n.outputs[0].links),
                  key=lambda im: not any(l.to_socket.name == "Base Color" for n in nodes if n.type == "TEX_IMAGE" and n.image == im for l in n.outputs[0].links))
    W, H = imgs[0].size
    pxs = []
    for img in imgs:
        a = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(a); pxs.append(a.reshape(H, W, 4))
    base = pxs[0].copy(); orig = [p.copy() for p in pxs]
    painted = np.zeros((H, W), bool)

    def texels(ti):  # pixel rows, cols and 3D points covered by triangle ti in the texture
        uv = tuv[ti] * [W, H]
        x0, y0 = np.floor(uv.min(0) - 1).astype(int); x1, y1 = np.ceil(uv.max(0) + 1).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, W)), np.arange(max(y0, 0), min(y1, H)))
        p = np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1)
        a, b, c = uv
        m = np.array([b - a, c - a]).T
        if abs(np.linalg.det(m)) < 1e-9:
            return None
        l12 = np.linalg.solve(m, (p - a).T).T
        l = np.c_[1 - l12.sum(1), l12]
        ok = l.min(1) > -1e-6  # inside only: past the edge are other patches (the gutter gets padded at the end)
        return ys.ravel()[ok], xs.ravel()[ok], l[ok] @ co[tv[ti]]

    def sample(px, uv):
        x = uv[0] * W - 0.5; y = uv[1] * H - 0.5
        i, j = int(np.clip(np.floor(y), 0, H - 2)), int(np.clip(np.floor(x), 0, W - 2)); fy, fx = y - i, x - j
        return (px[i, j] * (1 - fx) * (1 - fy) + px[i, j + 1] * fx * (1 - fy) + px[i + 1, j] * (1 - fx) * fy + px[i + 1, j + 1] * fx * fy)

    # the face's mirror plane: the nose tip
    nose = (cen[:, 1] > 1.38) & (cen[:, 1] < 1.46)
    xm = cen[nose][np.argmax(cen[nose][:, 2]), 0]
    print("mirror x", xm)

    # 1. his right eye (x < xm) becomes the mirror of his left
    box = (cen[:, 0] < xm - 0.008) & (cen[:, 0] > xm - 0.125) & (cen[:, 1] > EYE_Y[0]) & (cen[:, 1] < EYE_Y[1]) & (cen[:, 2] > 0.06)
    n_eye = 0
    for ti in np.nonzero(box)[0]:
        r = texels(ti)
        if r is None:
            continue
        for y, x, p in zip(*r):
            q = Vector((2 * xm - p[0], p[1], p[2]))
            loc, _, k, d = bvh.find_nearest(q)
            if d > 0.006:  # no matching surface on the other side (a hair strand): leave it
                continue
            A = [Vector(co[v]) for v in tv[k]]; U = [Vector((*tuv[k][i], 0)) for i in range(3)]
            uv = barycentric_transform(loc, *A, *U)
            for px, o in zip(pxs, orig):
                px[y, x] = sample(o, (uv.x, uv.y))
            painted[y, x] = True
            n_eye += 1
    print("eye texels", n_eye)

    is_blue = lambda c: c[..., 2] > c[..., 0] + 0.08  # the shirt
    tri_col = np.array([sample(base, uv.mean(0))[:3] for uv in tuv])

    def clean_edge(name, sel, o, ax):
        """Where the shirt ends (neckline, a sleeve), a clean edge in the shirt's own colour: fit the hem as a smooth
        curve around the axis (skin lies along +ax), then repaint either side of it. The hem is a lip standing out from
        the skin, so whatever stands out past the skin's own surface just beyond the hem counts as shirt: the edge
        follows that crease instead of cutting across the lip."""
        ax = np.asarray(ax, float); ax /= np.linalg.norm(ax)
        e1 = np.cross(ax, [0, 0, 1] if abs(ax[2]) < 0.9 else [1, 0, 0]); e1 /= np.linalg.norm(e1); e2 = np.cross(ax, e1)

        def frame(P):
            q = P - o; h = q @ ax
            return h, np.arctan2(q @ e2, q @ e1), np.linalg.norm(q - np.outer(h, ax), axis=1)

        fourier = lambda t: np.c_[np.ones_like(t), np.cos(t), np.sin(t), np.cos(2 * t), np.sin(2 * t)]
        idx = np.nonzero(sel)[0]
        h, th, rad = frame(cen[idx]); bl = is_blue(tri_col[idx])
        bins = np.linspace(-np.pi, np.pi, 25); bt, bh = [], []
        for k in range(24):
            m = (th >= bins[k]) & (th < bins[k + 1])
            if m.sum() < 6:
                continue
            cand = np.sort(h[m]); err = [(bl[m] & (h[m] > c)).sum() + (~bl[m] & (h[m] < c)).sum() for c in cand]
            bt.append((bins[k] + bins[k + 1]) / 2); bh.append(cand[int(np.argmin(err))])
        hc = np.linalg.lstsq(fourier(np.array(bt)), np.array(bh), rcond=None)[0]
        hem = lambda t: fourier(t) @ hc
        d = h - hem(th)
        nb = (d > 0.012) & (d < 0.035)  # skin just past the hem: its radius is the skin's own surface
        rt, rr = [], []
        for k in range(24):
            m = nb & (th >= bins[k]) & (th < bins[k + 1])
            if m.sum() >= 4:
                rt.append((bins[k] + bins[k + 1]) / 2); rr.append(np.median(rad[m]))
        rc = np.linalg.lstsq(fourier(np.array(rt)), np.array(rr), rcond=None)[0]
        skin_r = lambda t: fourier(t) @ rc
        skin = [np.median(np.array([sample(px, tuv[i].mean(0))[:3] for i in idx[(~bl) & (d > 0)]]), 0) for px in pxs]
        shirt = [np.median(np.array([sample(px, tuv[i].mean(0))[:3] for i in idx[bl & (d < 0)]]), 0) for px in pxs]
        n = 0
        for ti in idx[np.abs(d) < 0.045]:
            r = texels(ti)
            if r is None:
                continue
            ys_, xs_, P = r
            hh, tt, rp = frame(P); dd = hh - hem(tt)
            shirt_ = (dd < -0.012) | ((rp > skin_r(tt) + LIP) & (dd < 0.02))
            ob = is_blue(base[ys_, xs_])
            for k, px in enumerate(pxs):
                c = px[ys_, xs_, :3]
                c[~shirt_] = skin[k]
                c[shirt_ & ~ob] = shirt[k]
                px[ys_, xs_, :3] = c
            painted[ys_, xs_] = True
            n += len(ys_)
        print(name, "texels", n, "hem", np.round(bh, 3))

    # 2. the neckline and both sleeves
    neck = (cen[:, 1] > 1.12) & (cen[:, 1] < 1.38) & (np.abs(cen[:, 0] - xm) < 0.16)
    clean_edge("neck", neck, np.array([xm, 0, np.median(cen[neck, 2])]), (0, 1, 0))
    for s in (1, -1):
        arm_ = (s * (cen[:, 0] - xm) > 0.19) & (s * (cen[:, 0] - xm) < 0.40) & (cen[:, 1] > 0.75)
        P = cen[arm_]; o = P.mean(0)
        ax = np.linalg.svd(P - o)[2][0]
        ax *= np.sign(ax[0]) * s  # out along the arm, toward the hand
        sleeve = arm_ & (s * (cen[:, 0] - xm) < 0.36)
        clean_edge(f"sleeve {s:+d}", sleeve, o, ax)


    # pad the repainted patches out into the gutter around them (texels no triangle covers), or filtering at a distance
    # blends the old gutter colour back in along the seams
    cover = np.zeros((H, W), bool)
    for ti in range(len(tv)):
        uv = tuv[ti] * [W, H]
        x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
        xs, ys = np.meshgrid(np.arange(max(x0, 0), min(x1, W)), np.arange(max(y0, 0), min(y1, H)))
        if xs.size == 0:
            continue
        a, b, c = uv; m = np.array([b - a, c - a]).T
        if abs(np.linalg.det(m)) < 1e-9:
            continue
        l12 = np.linalg.solve(m, (np.stack([xs.ravel() + 0.5, ys.ravel() + 0.5], 1) - a).T).T
        ok = (l12.min(1) >= 0) & (l12.sum(1) <= 1)
        cover[ys.ravel()[ok], xs.ravel()[ok]] = True
    rows, cols = np.nonzero(painted)
    r0, r1, c0, c1 = max(rows.min() - 16, 0), min(rows.max() + 17, H), max(cols.min() - 16, 0), min(cols.max() + 17, W)
    done = painted[r0:r1, c0:c1] | cover[r0:r1, c0:c1]
    grow = painted[r0:r1, c0:c1].copy()
    for _ in range(PAD):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            src_ = np.roll(grow, (dy, dx), (0, 1))
            take = src_ & ~done
            if take.any():
                for px in pxs:
                    blk = px[r0:r1, c0:c1]
                    blk[take] = np.roll(blk, (dy, dx), (0, 1))[take]
                grow |= take; done |= take
    print("padded", int(grow.sum() - painted.sum()))
    for img, px in zip(imgs, pxs):
        img.pixels.foreach_set(px.ravel())
    return imgs


if bpy.data.objects.get("char_mesh"):
    smooth_character(bpy.data.objects["char_mesh"])
    paint_face(bpy.data.objects["char_mesh"])

# Meshy models ship 2K-4K textures: 1024 is plenty for most at this size on screen. The tuk-tuk and taxi keep 2048:
# they pass close to the camera. The character keeps his full 4K (base colour and emission both carry his face),
# as JPEG so it stays a few MB
char = bpy.data.objects.get("char_mesh")
char_imgs = {n.image for s in (char.material_slots if char else []) for n in s.material.node_tree.nodes
             if n.type == "TEX_IMAGE" and n.image}
for img in bpy.data.images:
    if img in char_imgs:  # the exporter keeps JPEG only for images whose file is a .jpg
        jpg = bpy.path.abspath(f"//{bpy.path.clean_name(img.name)}.jpg")
        img.file_format = "JPEG"
        img.save(filepath=jpg, quality=90)
        img.filepath_raw = jpg
        if img.packed_file:  # the exporter would embed the packed original, not this JPEG (and the paint in it)
            img.unpack(method="REMOVE")
            img.reload()
    elif img.size[0] > 1024 and not img.name.startswith(("taxi_", "tuktuk_")):
        img.scale(1024, 1024)
    print("IMG", img.name, img.size[0])


def gl(v):
    """Blender Z-up -> glTF Y-up."""
    return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]


# camera rig for the scroll walk: the path points, plus where the camera looks
path = bpy.data.objects["PATH_walk"]
pts = [gl(path.matrix_world @ p.co) for s in path.data.splines for p in (s.bezier_points or s.points)]
cams = {}
for name in ("CAM_front", "CAM_close"):
    c = bpy.data.objects[name]
    fwd = c.matrix_world.to_quaternion() @ __import__("mathutils").Vector((0, 0, -1))
    cams[name] = {"pos": gl(c.location), "dir": gl(fwd), "fov": round(c.data.angle_y * 57.2958, 2)}
hot = {o.name: {"hotspot": o["hotspot"], "pos": gl(o.matrix_world.translation)} for o in bpy.data.objects if "hotspot" in o.keys()}
with open(os.path.join(out_dir, "rig.json"), "w") as f:
    json.dump({"walk": pts, "cams": cams, "hotspots": hot}, f, indent=1)

bpy.ops.export_scene.gltf(
    filepath=os.path.join(out_dir, "storefront.glb"),
    export_format="GLB",
    export_apply=True,       # bake bevels, skins, remesh, decimate
    export_extras=True,      # HOT_* "hotspot" property -> userData.hotspot
    export_cameras=False,
    export_lights=False,     # the page lights the scene itself (sun, sky, interior lamps)
    export_yup=True,
    export_animation_mode="NLA_TRACKS",  # one glTF animation per NLA track: "wave", "idle"
    export_draco_mesh_compression_enable=True,  # the page loads it with three's DRACOLoader
    export_draco_mesh_compression_level=7,
    export_image_quality=90,  # the character's 4K textures (the rest stay PNG)
)
print("exported", out_dir)
