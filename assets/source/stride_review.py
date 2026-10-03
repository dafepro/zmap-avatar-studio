"""Render actual exported Stride assemblies, including runtime weight/pose fitting.

STRIDE_EVIDENCE=1 node --import tsx --test tests/stride-footwear.test.ts
blender -b --python assets/source/stride_review.py

The JSON input is evaluated runtime geometry, not an artist approximation of a
pose. Blender supplies the clearly labelled illustrative render, not WebGL.
"""
import bpy
import bmesh
import json
import math
import struct
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/evidence/stride'
snapshot_path=ROOT/'outputs/stride/runtime-snapshots.json'
snapshots={s['name']:s for s in json.loads(snapshot_path.read_text())}
scene=bpy.data.scenes.new('Stride · actual runtime geometry review')
bpy.context.window.scene=scene
scene.render.engine='CYCLES'
scene.cycles.samples=24
scene.cycles.use_denoising=False
scene.render.resolution_x=1600
scene.render.resolution_y=1100
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Stride neutral review world')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.76,.74,.68,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
scene.view_settings.view_transform='Standard'

def co(p):return (p[0],-p[2],p[1])
def aim(obj,p):obj.rotation_euler=(Vector(co(p))-obj.location).to_track_quat('-Z','Y').to_euler()

# Extract each original embedded texture without substituting the concept.
images={}
for asset_id in ['face-grin','shirt-jersey']:
    binary=(ROOT/'public/models'/(asset_id+'.glb')).read_bytes()
    n=struct.unpack_from('<I',binary,12)[0]
    doc=json.loads(binary[20:20+n]);blob=binary[28+n:]
    if not doc.get('images'):continue
    view=doc['bufferViews'][doc['images'][0]['bufferView']]
    texture_path=ROOT/'outputs/stride'/(asset_id+'-original.png')
    texture_path.write_bytes(blob[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
    images[asset_id]=bpy.data.images.load(str(texture_path))
cache={}
def material(spec,asset_id=None):
    key=(spec['name'],tuple(spec['color']),spec['texture'],asset_id)
    if key in cache:return cache[key]
    mat=bpy.data.materials.new(spec['name']);mat.use_nodes=True
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;nodes.clear()
    output=nodes.new('ShaderNodeOutputMaterial')
    emission=nodes.new('ShaderNodeEmission')
    if spec['texture']:
        tex=nodes.new('ShaderNodeTexImage');tex.image=images[asset_id]
        paint=nodes.new('ShaderNodeMixRGB');paint.blend_type='MULTIPLY';paint.inputs[0].default_value=1;paint.inputs[1].default_value=tuple(spec['color'])+(1,);links.new(tex.outputs['Color'],paint.inputs[2]);links.new(paint.outputs[0],emission.inputs[0])
        transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader')
        links.new(tex.outputs['Alpha'],mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs[0])
    else:
        geo=nodes.new('ShaderNodeNewGeometry');dot=nodes.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=Vector((-.5,-.8,.9)).normalized();links.new(geo.outputs['Normal'],dot.inputs[0])
        ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='CONSTANT'
        for elem in list(ramp.color_ramp.elements)[1:]:ramp.color_ramp.elements.remove(elem)
        for i,(pos,gain) in enumerate([(0,.53),(.18,.77),(.58,1)]):
            elem=ramp.color_ramp.elements[0] if i==0 else ramp.color_ramp.elements.new(pos);elem.position=pos;elem.color=tuple(c*gain for c in spec['color'])+(1,)
        links.new(dot.outputs['Value'],ramp.inputs[0]);links.new(ramp.outputs[0],emission.inputs[0]);links.new(emission.outputs[0],output.inputs[0])
    cache[key]=mat
    return mat

ink=bpy.data.materials.new('Silhouette ink');ink.use_nodes=True
nodes=ink.node_tree.nodes;links=ink.node_tree.links;nodes.clear()
geo=nodes.new('ShaderNodeNewGeometry');front=nodes.new('ShaderNodeBsdfTransparent');back=nodes.new('ShaderNodeEmission');back.inputs[0].default_value=(.015,.011,.023,1)
mix=nodes.new('ShaderNodeMixShader');links.new(geo.outputs['Backfacing'],mix.inputs[0]);links.new(front.outputs[0],mix.inputs[1]);links.new(back.outputs[0],mix.inputs[2]);out=nodes.new('ShaderNodeOutputMaterial');links.new(mix.outputs[0],out.inputs[0])
generated=[]
def assemble(name,offset=(0,0,0),yaw=0,shoe_only=False):
    parent=bpy.data.objects.new(name,None);scene.collection.objects.link(parent);generated.append(parent)
    parent.location=co(offset);parent.rotation_euler.z=yaw
    for spec in snapshots[name]['meshes']:
        if shoe_only and spec['asset']!='shoes-stride':continue
        # Profile projection is camera-dependent in the runtime. For this
        # front-biased reference view keep the actual front layer only.
        if spec['asset']=='face-grin' and any('profile' in m['name'] for m in spec['materials']):continue
        indices=spec['indices'] or list(range(len(spec['positions'])))
        faces=[tuple(indices[i:i+3])for i in range(0,len(indices),3)]
        data=bpy.data.meshes.new(spec['name']);data.from_pydata([co(p)for p in spec['positions']],[],faces);data.update()
        obj=bpy.data.objects.new(spec['name'],data);scene.collection.objects.link(obj);obj.parent=parent;generated.append(obj)
        for mat_spec in spec['materials']:data.materials.append(material(mat_spec,spec['asset']))
        for group in spec['groups']:
            for tri in range(group['start']//3,(group['start']+group['count'])//3):data.polygons[tri].material_index=group['materialIndex']
        if spec['uv']:
            uv=data.uv_layers.new(name='Original exported UV')
            for loop in data.loops:uv.data[loop.index].uv=(spec['uv'][loop.vertex_index][0],1-spec['uv'][loop.vertex_index][1])
        if spec['asset']!='face-grin':
            hull=obj.copy();hull.data=data.copy();scene.collection.objects.link(hull);generated.append(hull)
            bm=bmesh.new();bm.from_mesh(hull.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.normal_update()
            for v in bm.verts:v.co+=v.normal*(.0010 if shoe_only else .0022)
            bm.to_mesh(hull.data);bm.free();hull.data.materials.clear();hull.data.materials.append(ink)
            for p in hull.data.polygons:p.material_index=0
    return parent

def clear():
    for obj in generated:bpy.data.objects.remove(obj,do_unlink=True)
    generated.clear()

data=bpy.data.cameras.new('Review camera');camera=bpy.data.objects.new('Review camera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
def label(text,pos,size=.045):
    data=bpy.data.curves.new('Evidence label','FONT');data.body=text;data.size=size;data.align_x='CENTER';data.extrude=0
    obj=bpy.data.objects.new('Evidence label',data);scene.collection.objects.link(obj);obj.location=co(pos);obj.rotation_euler=camera.rotation_euler;generated.append(obj)
    data.materials.append(material({'name':'Evidence typography','color':[.03,.026,.04],'texture':False}))

def render(filename,pos,target,scale):
    camera.location=co(pos);aim(camera,target);camera.data.ortho_scale=scale
    scene.render.filepath=str(OUT/filename);bpy.ops.render.render(write_still=True)

assemble('rest-0',shoe_only=True)
render('blender-actual-shoes.png',(1.0,.70,1.5),(0,.18,.06),.93)
clear()
assemble('rest-0',shoe_only=True)
render('blender-actual-shoes-rear.png',(-1.0,.60,-1.5),(0,.19,0),.91)
clear()
for x,w in [(-.82,-1),(0,0),(.82,1)]:assemble('rest-'+str(w),(x,0,0),yaw=-.12)
camera.location=co((3.0,2.7,7.0));aim(camera,(0,1.02,0));camera.data.ortho_scale=3.9
for x,w in [(-.82,-1),(0,0),(.82,1)]:label('BUILD '+str(w),(x,2.24,0),.056)
label('ACTUAL EXPORTED GLB | RUNTIME-FITTED VERTICES | BLENDER CEL REVIEW',(0,-.13,0),.038)
scene.render.filepath=str(OUT/'blender-runtime-builds.png');bpy.ops.render.render(write_still=True)
clear()
for x,frame in [(-.90,42),(0,60),(.90,78)]:assemble('run-0-'+str(frame),(x,0,0),yaw=.42)
camera.location=co((3.1,2.3,7));aim(camera,(0,1.04,0));camera.data.ortho_scale=4.2
label('ACTUAL EXPORTED GLB | RUNTIME RUN POSES | BLENDER CEL REVIEW',(0,-.14,0),.039)
scene.render.filepath=str(OUT/'blender-runtime-run.png');bpy.ops.render.render(write_still=True)
clear()
assemble('ankle-roll',shoe_only=True)
render('blender-runtime-ankle.png',(1,.80,1.4),(0,.18,.03),1.20)
print('STRIDE_REVIEW_COMPLETE',flush=True)
