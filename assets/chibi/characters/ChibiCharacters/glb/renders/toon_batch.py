# toon_batch.py
# Batch toon-shade & render GLB files in Blender (Eevee), headless-friendly.

import bpy, os, math, mathutils, sys

# ========= USER CONFIG =========
INPUT_DIR  = r"C:\Users\Owner\OneDrive\Desktop\Kana-reader\Kana-reader2\assets\chibi\characters\ChibiCharacters\glb"
OUTPUT_DIR = r"C:\Users\Owner\OneDrive\Desktop\Kana-reader\Kana-reader2\assets\chibi\characters\ChibiCharacters\renders"
IMG_SIZE   = (1024, 1024)         # (width, height)
ANGLES     = list(range(0, 360, 45))  # turntable angles in degrees
BACKGROUND_TRANSPARENT = True     # PNGs with alpha
OUTLINE_THICKNESS = 1.25          # Freestyle px thickness (view-space)
RIM_STRENGTH = 1.0                # 0 disables rim light
# Light colors are warm/pastel friendly
KEY_LIGHT_INTENSITY = 1500.0
FILL_LIGHT_INTENSITY = 700.0
RIM_LIGHT_INTENSITY = 1000.0
# ========= END CONFIG =========

def ensure_dirs():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def set_engine_to_eevee():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'  # in 4.x this covers Eevee Next
    scene.render.resolution_x, scene.render.resolution_y = IMG_SIZE
    scene.render.film_transparent = BACKGROUND_TRANSPARENT
    # Freestyle outlines
    scene.view_layers["View Layer"].use_freestyle = True
    fs = scene.view_layers["View Layer"].freestyle_settings
    fs.use_smoothness = True
    scene.render.line_thickness = OUTLINE_THICKNESS

def add_lights():
    # Key light (warm)
    key = bpy.data.lights.new(name="Key_Light", type='AREA')
    key.energy = KEY_LIGHT_INTENSITY
    key.color = (1.0, 0.95, 0.9)
    key_obj = bpy.data.objects.new("Key_Light", key)
    bpy.context.collection.objects.link(key_obj)
    key_obj.location = (2.5, -2.5, 2.0)

    # Fill light (cool)
    fill = bpy.data.lights.new(name="Fill_Light", type='AREA')
    fill.energy = FILL_LIGHT_INTENSITY
    fill.color = (0.9, 0.95, 1.0)
    fill_obj = bpy.data.objects.new("Fill_Light", fill)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = (-2.0, 2.0, 1.5)

    # Rim light (optional)
    if RIM_STRENGTH > 0:
        rim = bpy.data.lights.new(name="Rim_Light", type='POINT')
        rim.energy = RIM_LIGHT_INTENSITY * RIM_STRENGTH
        rim.color = (1.0, 1.0, 1.0)
        rim_obj = bpy.data.objects.new("Rim_Light", rim)
        bpy.context.collection.objects.link(rim_obj)
        rim_obj.location = (0.0, -3.0, 2.0)

def get_or_make_camera():
    cam = bpy.data.objects.get("Camera")
    if cam is None:
        bpy.ops.object.camera_add(location=(0.0, -3.0, 2.2), rotation=(math.radians(70), 0, 0))
        cam = bpy.context.object
    bpy.context.scene.camera = cam
    return cam

def frame_object_in_camera(cam, target_obj):
    # Fit camera distance to object bounds
    bpy.context.view_layer.update()
    bbox = [target_obj.matrix_world @ mathutils.Vector(corner) for corner in target_obj.bound_box]
    center = sum(bbox, mathutils.Vector()) / 8.0
    dims = target_obj.dimensions
    radius = max(dims.x, dims.y, dims.z) * 0.75
    cam.location = (center.x, center.y - (radius * 3.0), center.z + radius * 1.1)
    cam.data.lens = 50

def make_toon_material(name="Toon_Mat", base_color=(0.9, 0.85, 0.8)):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for n in list(nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nodes.remove(n)

    out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')

    # Nodes
    diffuse = nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (*base_color, 1.0)
    diffuse.inputs["Roughness"].default_value = 0.0

    sh2rgb = nodes.new("ShaderNodeShaderToRGB")
    ramp = nodes.new("ShaderNodeValToRGB")
    # 2–3 bands; tweak positions for softer learning look
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.75
    # Shadow color slightly lilac/gray for cozy tone
    ramp.color_ramp.elements[0].color = (0.75, 0.72, 0.9, 1.0)  # light lilac
    ramp.color_ramp.elements[1].color = (1.0, 0.98, 0.95, 1.0)  # warm highlight

    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0

    # Links
    links.new(diffuse.outputs["BSDF"], sh2rgb.inputs["Shader"])
    links.new(sh2rgb.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return mat

def apply_toon_to_all_meshes(root):
    toon = make_toon_material()
    for obj in root.children_recursive:
        if getattr(obj, "type", "") == 'MESH':
            if not obj.data.materials:
                obj.data.materials.append(toon)
            else:
                # Replace existing materials to enforce unified NPR look
                for i in range(len(obj.data.materials)):
                    obj.data.materials[i] = toon

def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    roots = [o for o in bpy.context.selected_objects if o.type in {'MESH','EMPTY','ARMATURE'}]
    # Try to find a sensible top-level parent
    if roots:
        # Make a collection of imported objects
        root_parent = roots[0]
        return root_parent
    # Fallback to any object
    return bpy.context.selected_objects[0] if bpy.context.selected_objects else None

def rotate_z(obj, deg):
    e = obj.rotation_euler
    e.z = math.radians(deg)

def deselect_all():
    for o in bpy.context.selected_objects:
        o.select_set(False)

def clean_scene_except_camera_lights():
    for obj in list(bpy.context.scene.objects):
        if obj.type not in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(obj, do_unlink=True)

def render_to(filepath):
    bpy.context.scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)

def process_one_glb(glb_path):
    clean_scene_except_camera_lights()
    imported_root = import_glb(glb_path)
    if imported_root is None:
        print(f"[WARN] Could not import: {glb_path}")
        return

    apply_toon_to_all_meshes(imported_root)
    cam = get_or_make_camera()
    frame_object_in_camera(cam, imported_root)

    base = os.path.splitext(os.path.basename(glb_path))[0]
    out_dir = os.path.join(OUTPUT_DIR, base)
    os.makedirs(out_dir, exist_ok=True)

    # Turntable renders
    for idx, ang in enumerate(ANGLES):
        rotate_z(imported_root, ang)
        fp = os.path.join(out_dir, f"render_{idx:02d}.png")
        render_to(fp)
        print(f"[OK] {fp}")

def main():
    ensure_dirs()
    reset_scene()
    set_engine_to_eevee()
    add_lights()
    get_or_make_camera()

    # Ensure PNG with alpha
    bpy.context.scene.render.image_settings.file_format = 'PNG'
    bpy.context.scene.render.image_settings.color_mode = 'RGBA'
    bpy.context.scene.render.image_settings.compression = 15

    # Process files
    glbs = [os.path.join(INPUT_DIR, f) for f in os.listdir(INPUT_DIR) if f.lower().endswith(".glb")]
    if not glbs:
        print("[INFO] No .glb files found in", INPUT_DIR)
        return
    for path in glbs:
        print("[RUN]", os.path.basename(path))
        process_one_glb(path)

if __name__ == "__main__":
    main()


