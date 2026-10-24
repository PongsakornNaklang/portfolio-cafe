"""Shrink the raw Meshy street models into small GLBs the build imports (meshy/street/*.glb).

Run once after downloading new models from Meshy (the raw files are 20-60 MB each, kept out of git):
  blender -b -P blender/prep_meshy.py -- <folder with the Meshy_AI_*.glb files> [names to redo, e.g. cat]
Each model ends up facing +X, standing on z=0, centred, decimated, with 1024 px textures.
"""
import glob
import os
import sys
from math import radians

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
src, only = args[0], set(args[1:])
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "meshy", "street")
os.makedirs(out, exist_ok=True)

# name: (file pattern, faces to keep, scale, turn about Z so the front faces +X, texture size, flatten painted stripes)
MODELS = {
    "taxi": ("Meshy_AI_cat_driving_pink_taxi_1024042210*.glb", 25000, 2.05, 180, 1024, False),
    "tuktuk": ("Meshy_AI_minimal_dog_driving_t_*.glb", 20000, 1.37, 180, 1024, False),
    "bird": ("Meshy_AI_minimal_myna_bird_*.glb", 6000, 0.24, 90, 512, False),
    "cat": ("Meshy_AI_sleeping_curled_cat_*.glb", 12000, 0.25, 0, 1024, True),
}


def flatten_stripes(ob, max_lift=0.031):
    """Meshy sculpts the darker painted stripes as raised patches. Find them by their paint colour and refill each one
    from the surface around it (a smooth fill that carries on the body's curve, the patch's surroundings held still),
    so the paint lies flat.
    A patch that would have to move far is real shape, not a stripe (the dark tail tip): it's left alone."""
    me = ob.data
    img = next(l.from_node.image for l in me.materials[0].node_tree.links if l.to_socket.name == "Base Color")
    w, h = img.size
    b = 8  # the paint is speckled: judge the colour on 8x8-pixel averages
    px = np.array(img.pixels[:], np.float32).reshape(h // b, b, w // b, b, 4).mean((1, 3))
    uv = np.empty(len(me.loops) * 2, np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    c = px[np.clip((uv[:, 1] * h / b).astype(int), 0, h // b - 1), np.clip((uv[:, 0] * w / b).astype(int), 0, w // b - 1)]
    lum = c[:, 0] * 0.3 + c[:, 1] * 0.59 + c[:, 2] * 0.11
    # darker orange: not the light body, the white chest, the pink nose or the dark eye lines
    stripe = (c[:, 0] > 0.55) & (c[:, 1] < 0.45) & (c[:, 2] < 0.3) & (lum > 0.25) & (lum < 0.5)
    lv = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", lv)
    nv = len(me.vertices)
    mask = np.bincount(lv, stripe, nv) > np.bincount(lv, None, nv) * 0.5
    ev = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get("vertices", ev)
    ev = ev.reshape(-1, 2)

    def grow(m):
        m = m.copy()
        m[ev[m[ev].any(1)].ravel()] = True
        return m

    mask = ~grow(~grow(grow(mask)))  # close pinholes
    mask = grow(grow(grow(mask)))  # and take in the patch's raised edge, down to the body
    co = np.empty(nv * 3, np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    deg = np.maximum(np.bincount(ev.ravel(), minlength=nv), 1)[:, None]

    def nbsum(v):
        return np.stack([np.bincount(ev[:, 0], v[ev[:, 1], k], nv) + np.bincount(ev[:, 1], v[ev[:, 0], k], nv)
                         for k in range(3)], 1)

    def bilap(v):  # L^T L v, L = v - mean of neighbours: the bending energy, smallest when curves carry on smoothly
        w = v - nbsum(v) / deg
        return w - nbsum(w / deg)

    def op(xm):
        v = np.zeros_like(co)
        v[mask] = xm
        return bilap(v)[mask]

    # solve for the patch so the bending energy is least, by conjugate gradients (one column per axis)
    fixed = np.where(mask[:, None], 0, co)
    b = -bilap(fixed)[mask]
    x = co[mask].copy()
    r = b - op(x)
    d = r.copy()
    rs = (r * r).sum(0)
    for it in range(4000):
        ad = op(d)
        a = rs / np.maximum((d * ad).sum(0), 1e-30)
        x += a * d
        r -= a * ad
        rs2 = (r * r).sum(0)
        if np.sqrt(rs2.max()) < 1e-9:
            break
        d = r + rs2 / rs * d
        rs = rs2
    print("FLATTEN solved in", it, "steps")
    new = co.copy()
    new[mask] = x
    # patches = connected parts of the mask (spread the smallest vertex index until nothing changes)
    lab = np.where(mask, np.arange(nv), -1)
    inner = ev[mask[ev].all(1)]
    while True:
        lo = np.minimum(lab[inner[:, 0]], lab[inner[:, 1]])
        nxt = lab.copy()
        np.minimum.at(nxt, inner[:, 0], lo)
        np.minimum.at(nxt, inner[:, 1], lo)
        if (nxt == lab).all():
            break
        lab = nxt
    size = np.linalg.norm(co.max(0) - co.min(0))
    move = np.linalg.norm(new - co, axis=1)
    kept = 0
    for l in np.unique(lab[mask]):
        part = lab == l
        if move[part].max() > max_lift * size:
            new[part] = co[part]
            print("FLATTEN skip patch", int(part.sum()), "verts, would move", round(float(move[part].max() / size), 3))
        else:
            kept += int(part.sum())
    me.vertices.foreach_set("co", new.ravel())
    me.update()
    print("FLATTEN", kept, "of", nv, "verts")


for name, (pat, faces, scale, turn, tex, flat) in MODELS.items():
    if only and name not in only:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glob.glob(os.path.join(src, pat))[0])
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in meshes:
        o.data.transform(o.matrix_world)  # bake the importer's empties/rotations into the mesh
        o.matrix_world = Matrix()
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    bpy.context.view_layer.objects.active = meshes[0]
    for o in meshes:
        o.select_set(True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    ob.data.transform(Matrix.Rotation(radians(turn), 4, "Z") @ Matrix.Scale(scale, 4))
    pts = [v.co for v in ob.data.vertices]
    lo = Vector([min(p[k] for p in pts) for k in range(3)])
    hi = Vector([max(p[k] for p in pts) for k in range(3)])
    ob.data.transform(Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
    # Meshy splits the mesh at every texture seam; decimating it like that tears the UV islands (dark cracks in the
    # paint). Welded, the decimator sees one surface and keeps the seams in the UVs intact.
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(ob.data)
    bm.free()
    if flat:  # first thin it out (the stripes get a few rings across instead of dozens), then flatten
        d = ob.modifiers.new("dec", "DECIMATE")
        d.ratio = min(1, faces * 10 / len(ob.data.polygons))
        bpy.ops.object.modifier_apply(modifier=d.name)
        flatten_stripes(ob)
    full = ob.copy()
    full.data = ob.data.copy()
    bpy.context.collection.objects.link(full)
    d = ob.modifiers.new("dec", "DECIMATE")
    d.ratio = min(1, faces / len(ob.data.polygons))
    bpy.ops.object.modifier_apply(modifier=d.name)
    # so few faces leave the surface dented: borrow the smooth shading of the full mesh. Its normal map only fits the
    # full mesh, so it goes too.
    t = ob.modifiers.new("nrm", "DATA_TRANSFER")
    t.object, t.use_loop_data, t.data_types_loops, t.loop_mapping = full, True, {"CUSTOM_NORMAL"}, "POLYINTERP_NEAREST"
    bpy.ops.object.modifier_apply(modifier=t.name)
    bpy.data.objects.remove(full)
    for m in ob.data.materials:
        for l in [l for l in m.node_tree.links if l.to_socket.name in ("Normal", "Emission Color")]:  # emission: all black
            m.node_tree.links.remove(l)
        for n in m.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                n.inputs["Emission Strength"].default_value = 0  # or the unlinked emission glows white
    for img in bpy.data.images:
        if img.size[0] > tex:
            img.scale(tex, tex)
    print("PREP", name, len(ob.data.polygons), "faces", "size", [round(v, 2) for v in (hi - lo)])
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f"{name}.glb"), export_format="GLB", export_animations=False,
                              export_image_format="JPEG", export_jpeg_quality=85)
