"""Build one original Challenger face; never rebuild the legacy kit.

Run: blender -b --python assets/source/face_challenger.py
Requires assets/textures/face-challenger.png, rasterized from the sibling SVG.
The original concept is docs/references/challenger/concept.png. Face geometry
uses the established smooth radial paint envelope, with new asymmetric UVs.
"""
import ast
import bpy
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Load only reusable functions/data, never the legacy build's executable body.
exec(compile((ROOT / 'assets/source/kit_io.py').read_text(), 'kit_io.py', 'exec'), globals())
OUT = ROOT / 'public/capsule/models'
OUT.mkdir(parents=True, exist_ok=True)
reference = ast.parse((ROOT / 'assets/source/reference_kit.py').read_text())
for node in reference.body:
    if (isinstance(node, ast.FunctionDef) and node.name in
            {'head_section', 'face_depth', 'head_rows', 'fit_spec', 'smooth'}):
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'reference_face_functions', 'exec'), globals())
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in {'HEAD', 'FRAME'} for t in node.targets):
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'reference_face_data', 'exec'), globals())

scene = bpy.data.scenes.new('Challenger · original face authoring')
bpy.context.window.scene = scene
root, descriptor = asset('face-challenger', 'Challenger grin', 'face',
    'Original angular expression: asymmetrical cocked brow, one narrowed lid, confident off-center toothy grin, and independently drawn left/right profile ink.')
descriptor['rig'] = 'athlete-reference-v2'
pivot = mount(root, descriptor, 'head')
art = bpy.data.images.load(str(ROOT / 'assets/textures/face-challenger.png'), check_existing=False)
art.pack()
front = bpy.data.materials.new('face-ink-challenger')
front.use_nodes = True
bs = front.node_tree.nodes.get('Principled BSDF')
bs.inputs['Roughness'].default_value = 1
tex = front.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = art
front.node_tree.links.new(tex.outputs['Color'], bs.inputs['Base Color'])
front.node_tree.links.new(tex.outputs['Alpha'], bs.inputs['Alpha'])
front.surface_render_method = 'DITHERED'
front.use_backface_culling = True
front['expressionProjection'] = 'front'
profile = front.copy()
profile.name = 'face-ink-challenger-profile'
profile['expressionProjection'] = 'profile'

def surface(name, vertices, faces, uvs, material):
    obj = smooth(mesh(name, vertices, faces, material, pivot))
    uv = obj.data.uv_layers.new(name='Challenger atlas')
    for polygon in obj.data.polygons:
        for li in polygon.loop_indices:
            uv.data[li].uv = uvs[obj.data.loops[li].vertex_index]
    return obj

vertices, uvs, faces = [], [], []
ys = [-.185] + [y for y in head_rows() if -.162 <= y <= .092] + [.13]
columns = 17
for y in ys:
    rx, _, _ = head_section(y)
    for j in range(columns):
        x = math.sin((j - 8) * math.pi / 16) * rx
        vertices.append((x, y, face_depth(x, y) + .001))
        u = max(.001, min(.999, x / FRAME[2] + .5))
        v = max(.001, min(.999, (y - FRAME[1]) / FRAME[3] + .5))
        uvs.append((u / 2, (1 + v) / 2))
for row in range(len(ys) - 1):
    for j in range(columns - 1):
        a = row * columns + j
        faces.append((a, a + 1, a + columns + 1, a + columns))
surface('Challenger · fitted front paint', vertices, faces, uvs, front)

# The two cheek projections use different cells, preserving the front's
# asymmetry instead of mirroring one profile expression onto both sides.
for sign, start_x in [(-1, 768), (1, 512)]:
    vertices, uvs, faces = [], [], []
    columns = 9
    ys = [-.17] + [y for y in head_rows() if -.17 < y < .09] + [.09]
    for y in ys:
        rx, _, _ = head_section(y)
        for col in range(columns):
            # Follow the exact angular lattice of the actual head. Uniform-Z
            # samples cut across head bevel triangles and bury profile ink.
            angle = (1 - col / (columns - 1)) * math.pi / 2
            x = sign * rx * math.sin(angle)
            z = face_depth(x, y)
            t = max(0, min(1, (z - .025) / (face_depth(0, y) - .026)))
            vertices.append((x, y, z))
            uvs.append(((start_x + 1 + t * 254) / 1024, (y + .17) / .26 * .5))
    for row in range(len(ys) - 1):
        for col in range(columns - 1):
            a = row * columns + col
            faces.append((a, a + 1, a + columns + 1, a + columns))
    surface('Challenger · ' + ('right' if sign < 0 else 'left') + ' cheek paint', vertices, faces, uvs, profile)

descriptor['texture'] = {'maxDimension': 1024, 'maxCount': 1}
descriptor['fit'] = fit_spec('surface', .0015)
descriptor['fit']['projection'] = 'radial'
export(root, descriptor)
# Preserve a per-piece descriptor as reproducible source. Integration appends
# this record to the capsule manifest without changing the legacy catalog.
descriptor_dir = ROOT / 'public/capsule/parts'
descriptor_dir.mkdir(parents=True, exist_ok=True)
(descriptor_dir / 'face-challenger.json').write_text(json.dumps(descriptor, indent=2) + '\n')
# Keep the source surface socket-local and the original concept packed.
pivot.location = (0, 0, 0)
reference_image = bpy.data.images.load(str(ROOT / 'docs/references/challenger/concept.png'), check_existing=False)
reference_image.pack()
reference_empty = bpy.data.objects.new('Concept · Challenger (original built-in imagegen)', None)
scene.collection.objects.link(reference_empty)
reference_empty.empty_display_type = 'IMAGE'
reference_empty.data = reference_image
reference_empty.empty_display_size = 1
reference_empty.location = (.7, 0, 0)
reference_empty.hide_render = True
for obj in root.children_recursive:
    obj.hide_render = False
root.hide_render = False
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'assets/source/challenger/face-challenger.blend'))
print('CHALLENGER_DESCRIPTOR ' + json.dumps(descriptor))
