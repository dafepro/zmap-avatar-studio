"""Narrow interactive Blender repair of the reference body's pelvis weight field.

Import the published body without merging vertices, edit its real vertex groups,
then publish only those JOINTS_0/WEIGHTS_0 values into the original GLB buffer.
This deliberately preserves geometry, topology, bind matrices, materials, region
metadata, quantized hand weights, file size and all untouched bytes exactly.
The same thigh field is used by the complete reference-kit generator.
"""
import ast
import bpy
import hashlib
import json
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
path=ROOT/'public/models/body-athletic.glb'
original=path.read_bytes()
data=bytearray(original)
json_length=struct.unpack_from('<I',data,12)[0]
document=json.loads(data[20:20+json_length])
binary_start=28+json_length
namespace={}
for node in ast.parse((ROOT/'assets/source/reference_kit.py').read_text()).body:
    if isinstance(node,ast.FunctionDef) and node.name in {'ease','thigh_weights'}:
        exec(compile(ast.Module(body=[node],type_ignores=[]),'reference_kit.py','exec'),namespace)

if bpy.context.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
scene=bpy.data.scenes.get('Zoomap · pelvis weight continuity')
if scene is None:scene=bpy.data.scenes.new('Zoomap · pelvis weight continuity')
bpy.context.window.scene=scene
for obj in list(scene.objects):
    if obj.get('zmap_pelvis_weights'):bpy.data.objects.remove(obj,do_unlink=True)
before=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(path),merge_vertices=False)
for obj in set(bpy.data.objects)-before:obj['zmap_pelvis_weights']=True

mesh=next(m for m in document['meshes'] if 'upper-legs' in m['name'])
attributes=mesh['primitives'][0]['attributes']
obj=next(o for o in scene.objects if o.type=='MESH' and 'upper-legs' in o.name)
joints=[document['nodes'][index]['name'] for index in document['skins'][0]['joints']]

def accessor(name):
    a=document['accessors'][attributes[name]]
    view=document['bufferViews'][a['bufferView']]
    assert not a.get('sparse') and not a.get('normalized') and not view.get('byteStride')
    return a,binary_start+view.get('byteOffset',0)+a.get('byteOffset',0)

position,position_start=accessor('POSITION')
index,index_start=accessor('JOINTS_0')
weight,weight_start=accessor('WEIGHTS_0')
assert position['componentType']==5126 and index['componentType']==5121 and weight['componentType']==5126
assert len(obj.data.vertices)==position['count']==index['count']==weight['count']
changed=[]
allowed_bytes=set()
for v in obj.data.vertices:
    # glTF Y-up,+Z-forward becomes Blender Z-up,-Y-forward. Import ordering
    # and exact position equality are checked before publishing any weights.
    x,y,z=struct.unpack_from('<3f',data,position_start+12*v.index)
    assert tuple(v.co)==(x,-z,y)
    if abs(x)>=.05:continue
    old_joints=struct.unpack_from('<4B',data,index_start+4*v.index)
    old_weights=struct.unpack_from('<4f',data,weight_start+16*v.index)
    total=sum(w for j,w in zip(old_joints,old_weights) if joints[j] in {'leg_L','leg_R'})
    if total<=0:continue
    target=namespace['thigh_weights'](x,total)
    # Blender groups are float32. Re-summing the two published thigh values
    # can move total by one ULP, so do not repeatedly round an already authored
    # field. The tolerance is below the GLB's normalized-weight precision gate.
    current={joints[j]:w for j,w in zip(old_joints,old_weights) if w>0}
    if all(abs(current.get(name,0)-value)<=1e-7 for name,value in target.items()):continue
    for name,value in target.items():
        obj.vertex_groups[name].add([v.index],value,'REPLACE')
    authored=[(joints.index(obj.vertex_groups[g.group].name),g.weight) for g in v.groups if g.weight>1e-7]
    authored.sort(key=lambda pair:-pair[1])
    assert len(authored)<=4 and abs(sum(w for _,w in authored)-1)<1e-6
    authored += [(0,0)]*(4-len(authored))
    struct.pack_into('<4B',data,index_start+4*v.index,*[j for j,_ in authored])
    struct.pack_into('<4f',data,weight_start+16*v.index,*[w for _,w in authored])
    allowed_bytes.update(range(index_start+4*v.index,index_start+4*v.index+4))
    allowed_bytes.update(range(weight_start+16*v.index,weight_start+16*v.index+16))
    changed.append(v.index)

assert len(data)==len(original)
assert all(a==b or i in allowed_bytes for i,(a,b) in enumerate(zip(original,data)))
# The isolated editable source retains the actual groups used in the binary.
bpy.context.view_layer.update()
bpy.data.libraries.write(str(ROOT/'assets/source/pelvis-weight-continuity.blend'),{scene},fake_user=True,compress=True)
path.write_bytes(data)
catalog_path=ROOT/'public/catalog.json'
catalog=json.loads(catalog_path.read_text())
record=next(a for a in catalog['assets'] if a['id']=='body-athletic')
record['bytes']=len(data)
record['sha256']=hashlib.sha256(data).hexdigest()
catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
result={'scene':scene.name,'vertices':len(changed),'changedVertexIndices':changed,
        'changedBytes':sum(a!=b for a,b in zip(original,data)),
        'bytes':len(data),'triangles':record['triangles'],'sha256':record['sha256'],
        'geometryAndOtherPayloadsByteIdentical':True}
