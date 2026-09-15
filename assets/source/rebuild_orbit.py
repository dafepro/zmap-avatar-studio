"""Narrow, repeatable interactive Blender rebuild of Pocket Galaxy.

Preserve unrelated scenes and export only this asset and its manifest record.
The qualified annulus and proportional miniature fit live in novelty_galaxy.py.
"""
import ast
import bpy
import json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
if bpy.context.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
scene=bpy.data.scenes.get('Zoomap · orbital accessory')
if scene is None:scene=bpy.data.scenes.new('Zoomap · orbital accessory')
bpy.context.window.scene=scene
for obj in list(scene.objects):
    if obj.get('zmap_orbit'):bpy.data.objects.remove(obj,do_unlink=True)
before=set(bpy.data.objects)
namespace={'__file__':str(ROOT/'assets/source/reference_kit.py'),'bpy':bpy,
           'scene':scene,'Vector':Vector,'Matrix':Matrix}
exec(compile((ROOT/'assets/source/kit_io.py').read_text(),'kit_io.py','exec'),namespace)
catalog_path=ROOT/'public/catalog.json'
catalog=json.loads(catalog_path.read_text())
namespace['sockets']=catalog['rig']['sockets']
namespace['positions']={}
for socket in namespace['sockets']:
    namespace['positions'][socket['id']]=Vector(socket['position'])+(
        namespace['positions'][socket['parent']] if socket['parent'] else Vector())
namespace['old_asset']=namespace['asset']
module=ast.parse((ROOT/'assets/source/reference_kit.py').read_text())
for node in module.body:
    if isinstance(node,ast.FunctionDef) and node.name in {'asset','mount','smooth'}:
        exec(compile(ast.Module(body=[node],type_ignores=[]),'reference_kit.py','exec'),namespace)
exec(compile((ROOT/'assets/source/novelty_galaxy.py').read_text(),'novelty_galaxy.py','exec'),namespace)
original=next(record for record in catalog['assets'] if record['id']=='effect-pocket-galaxy')
root,record=namespace['asset'](original['id'],original['label'],original['slot'],original['description'])
parent=namespace['mount'](root,record,'root')
# A dedicated namespace avoids Blender's numeric name suffix when the complete
# reference scene is open; attachment identifiers intentionally exclude dots.
parent.name='orbit_effect-pocket-galaxy__root'
record['attachments'][0]['node']=parent.name
namespace['build_pocket_galaxy'](parent)
record['tags']=original['tags']
record['effect']='orbit'
namespace['export'](root,record)
# Read again at publication, preserving independent footwear or catalog edits.
catalog=json.loads(catalog_path.read_text())
catalog['assets']=[record if asset['id']==record['id'] else asset for asset in catalog['assets']]
catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
for obj in set(bpy.data.objects)-before:obj['zmap_orbit']=True
bpy.data.libraries.write(str(ROOT/'assets/source/orbital-accessory.blend'),{scene},fake_user=True,compress=True)
bpy.app.driver_namespace['zmap_orbit']=namespace
result={'scene':scene.name,'asset':record}
