"""Export the built storefront for the website: web/storefront.glb + web/rig.json.

Run after build_storefront.py has saved a .blend:
  blender -b out/storefront_day.blend -P blender/export_web.py -- web
"""
import json
import os
import sys

import bpy

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


if bpy.data.objects.get("char_mesh"):
    smooth_character(bpy.data.objects["char_mesh"])

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
