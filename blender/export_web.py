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
    export_draco_mesh_compression_enable=True,  # the page loads it with three's DRACOLoader
    export_draco_mesh_compression_level=7,
)
print("exported", out_dir)
