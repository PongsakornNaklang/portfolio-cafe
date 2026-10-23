"""Export the character alone, in an A-pose, as one FBX mesh for Mixamo's auto-rigger.

  blender -b out/storefront_day.blend -P blender/export_mixamo.py -- mixamo/nakang_character.fbx [preview.png]
"""
import os
import sys
from math import radians

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out = os.path.abspath(args[0])
os.makedirs(os.path.dirname(out), exist_ok=True)

root = bpy.data.objects["HOT_character"]
rig = bpy.data.objects["char_rig"]

# A-pose: both upper arms out ~45 degrees (Mixamo rigs arms-out poses far better than arms-down)
for b in rig.pose.bones:
    h = b.bone.head_local
    if abs(abs(h.x) - 0.18) < 0.01 and abs(h.z - 1.47) < 0.01:  # left and right shoulder joints
        axis = (rig.matrix_world @ b.bone.matrix_local).to_3x3().inverted() @ Vector((0, 1 if h.x < 0 else -1, 0))
        b.rotation_mode = "AXIS_ANGLE"
        b.rotation_axis_angle = (radians(45), *axis.normalized())
bpy.context.view_layer.update()

# every mesh under the character, baked with its modifiers (skin, remesh, armature pose) in world space
dg = bpy.context.evaluated_depsgraph_get()
parts = [o for o in root.children_recursive if o.type == "MESH" and o.visible_get()]
meshes = []
for o in parts:
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    me.transform(o.matrix_world)
    meshes.append(me)

# one object, feet on the ground at the origin, facing -Y (Blender front)
import bmesh  # noqa: E402
bm = bmesh.new()
mats = []
for me in meshes:
    offset = len(mats)
    for m in me.materials:
        mats.append(m)
    for p in me.polygons:
        p.material_index += offset
    bm.from_mesh(me)
merged = bpy.data.meshes.new("nakang_character")
bm.to_mesh(merged)
bm.free()
for m in mats:
    merged.materials.append(m)
low = min(v.co.z for v in merged.vertices)
cx = sum(v.co.x for v in merged.vertices) / len(merged.vertices)
cy = sum(v.co.y for v in merged.vertices) / len(merged.vertices)
merged.transform(__import__("mathutils").Matrix.Translation((-cx, -cy, -low)))

# fresh scene with only the character
scene = bpy.data.scenes.new("mixamo")
bpy.context.window.scene = scene
ob = bpy.data.objects.new("nakang_character", merged)
scene.collection.objects.link(ob)
dec = ob.modifiers.new("Decimate", "DECIMATE")  # keep the upload light (Mixamo prefers < 100k faces)
dec.ratio = 0.35
for p in merged.polygons:
    p.use_smooth = True

bpy.ops.export_scene.fbx(filepath=out, use_selection=False, apply_scale_options="FBX_SCALE_ALL",
                         use_mesh_modifiers=True, add_leaf_bones=False, bake_anim=False, path_mode="COPY", embed_textures=True)
print("exported", out, "faces", len(merged.polygons))

if len(args) > 1:  # preview render of what Mixamo will receive
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.location, cam.rotation_euler = (0, -6, 1.2), (radians(90), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.rotation_euler = (radians(50), 0, radians(-30))
    scene.collection.objects.link(sun)
    scene.world = bpy.data.worlds.new("w")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.8, 0.8, 1)
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 800, 1000
    scene.render.filepath = os.path.abspath(args[1])
    bpy.ops.render.render(write_still=True)
