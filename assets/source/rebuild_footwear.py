"""Rebuild only the three reference footwear assets through interactive Blender.

Keeps every unrelated scene/object intact. Geometry and weights are authored by
reference_kit.py; this narrow entry point avoids regenerating the avatar catalog.
"""
import ast
import bpy
import json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
if bpy.context.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
scene = bpy.data.scenes.get('Zoomap · articulated footwear')
if scene is None:
    scene = bpy.data.scenes.new('Zoomap · articulated footwear')
bpy.context.window.scene = scene
for obj in list(scene.objects):
    if obj.get('zmap_footwear'):
        bpy.data.objects.remove(obj, do_unlink=True)
before = set(bpy.data.objects)
# Shared exporter in an isolated namespace; no old scene's authoring state mutates.
namespace = {'__file__': str(ROOT/'assets/source/reference_kit.py'), 'bpy': bpy,
             'scene': scene, 'Matrix': Matrix, 'Vector': Vector}
exec(compile((ROOT/'assets/source/kit_io.py').read_text(), 'kit_io.py', 'exec'), namespace)
catalog_path = ROOT/'public/catalog.json'
catalog = json.loads(catalog_path.read_text())
namespace['sockets'] = catalog['rig']['sockets']
namespace['positions'] = {}
for socket in namespace['sockets']:
    namespace['positions'][socket['id']] = Vector(socket['position']) + (
        namespace['positions'][socket['parent']] if socket['parent'] else Vector())
namespace['old_asset'] = namespace['asset']
module = ast.parse((ROOT/'assets/source/reference_kit.py').read_text())
functions = {'color', 'asset', 'mount', 'smooth', 'ease', 'planar', 'section', 'tube', 'bind', 'make_shoes'}
for node in module.body:
    if isinstance(node, ast.FunctionDef) and node.name in functions:
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'reference_kit.py', 'exec'), namespace)
for channel in namespace['channels']:
    namespace[channel]['paletteChannel'] = channel
for material, value in [('primary','#f4f1eb'),('secondary','#292b2d'),('trim','#f5f2eb'),
                         ('skin','#d3a17a'),('hair','#594333'),('ink','#191d20'),('sole','#e9e7e3')]:
    namespace['color'](namespace[material], value)
for asset_id, label, style in [('shoes-court','Study sneakers','court'),
                               ('shoes-runner','Court runner','runner'),
                               ('shoes-high','Court high','high')]:
    namespace['make_shoes'](asset_id, label, style)
by_id = {record['id']:record for record in namespace['assets']}
for index, record in enumerate(catalog['assets']):
    if record['id'] in by_id:
        replacement = by_id[record['id']]
        catalog['assets'][index] = replacement
catalog_path.write_text(json.dumps(catalog, indent=2)+'\n')
for obj in set(bpy.data.objects)-before:
    obj['zmap_footwear'] = True
# Lay out the three editable pairs for inspection; export coordinates stay canonical.
for index, root in enumerate(namespace['roots']):
    root.location.x = (index-1)*.75
    root.hide_render = False
    for obj in root.children_recursive:obj.hide_render=False
# Preserve editable rig, source weights and geometry without saving unrelated scenes.
bpy.data.libraries.write(str(ROOT/'assets/source/articulated-footwear.blend'), {scene}, fake_user=True, compress=True)
bpy.app.driver_namespace['zmap_footwear'] = namespace
result = {'scene':scene.name, 'assets':[{key:record[key] for key in ['id','bytes','triangles','sha256','attachments','skin']}
                                    for record in namespace['assets']]}
