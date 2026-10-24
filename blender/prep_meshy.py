"""Shrink the raw Meshy street models into small GLBs the build imports (meshy/street/*.glb).

Run once after downloading new models from Meshy (the raw files are 20-60 MB each, kept out of git):
  blender -b -P blender/prep_meshy.py -- <folder with the Meshy_AI_*.glb files>
Each model ends up facing +X, standing on z=0, centred, decimated, with 1024 px textures.
"""
import glob
import os
import sys
from math import radians

import bmesh
import bpy
from mathutils import Matrix, Vector

src = sys.argv[sys.argv.index("--") + 1]
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "meshy", "street")
os.makedirs(out, exist_ok=True)

# name: (file pattern, faces to keep, scale, turn about Z so the front faces +X, texture size)
MODELS = {
    "taxi": ("Meshy_AI_cat_driving_pink_taxi_1024042210*.glb", 25000, 2.05, 180, 1024),
    "tuktuk": ("Meshy_AI_minimal_dog_driving_t_*.glb", 20000, 1.37, 180, 1024),
    "bird": ("Meshy_AI_minimal_myna_bird_*.glb", 6000, 0.24, 90, 512),
}

for name, (pat, faces, scale, turn, tex) in MODELS.items():
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
        for l in [l for l in m.node_tree.links if l.to_socket.name == "Normal"]:
            m.node_tree.links.remove(l)
    for img in bpy.data.images:
        if img.size[0] > tex:
            img.scale(tex, tex)
    print("PREP", name, len(ob.data.polygons), "faces", "size", [round(v, 2) for v in (hi - lo)])
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f"{name}.glb"), export_format="GLB", export_animations=False,
                              export_image_format="JPEG", export_jpeg_quality=85)
