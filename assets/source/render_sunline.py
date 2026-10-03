"""Render actual runtime-fitted/posed Sunline assemblies exported by
scripts/export-sunline-evidence.ts. Geometry is read from the exported GLBs through
AvatarLibrary before transfer; Blender review shading is not browser evidence.
Run: blender -b --python assets/source/render_sunline.py -- /tmp/sunline-runtime
"""
import bpy, json, math, sys, bmesh
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
INPUT=Path(sys.argv[sys.argv.index('--')+1])if '--'in sys.argv else Path('/tmp/sunline-runtime')
OUT=ROOT/'docs/evidence/sunline-courier';OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=False
scene.render.resolution_x=800;scene.render.resolution_y=880;scene.render.resolution_percentage=100
scene.world.color=(.65,.65,.65);scene.view_settings.view_transform='Standard'
scene.render.film_transparent=False
scene.render.dither_intensity=0
world=bpy.data.worlds.new('Sunline ivory review');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.73,.75,.72,1);world.node_tree.nodes['Background'].inputs[1].default_value=.8;scene.world=world

def co(p):return(p[0],-p[2],p[1])
def material(spec,face=False):
    m=bpy.data.materials.new(spec['name']);m.use_nodes=True;m.use_backface_culling=True
    n=m.node_tree.nodes;n.clear();L=m.node_tree.links
    out=n.new('ShaderNodeOutputMaterial');emit=n.new('ShaderNodeEmission');emit.inputs['Strength'].default_value=1
    color=n.new('ShaderNodeRGB');color.outputs[0].default_value=(*spec['color'],1);source=color.outputs[0]
    if spec.get('vertexColors'):
        attr=n.new('ShaderNodeVertexColor');attr.layer_name='Pigment'
        mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;L.new(source,mult.inputs[1]);L.new(attr.outputs['Color'],mult.inputs[2]);source=mult.outputs[0]
    tex=None
    if spec.get('map'):
        tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(INPUT/spec['mapFile']),check_existing=True)
        mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;L.new(source,mult.inputs[1]);L.new(tex.outputs['Color'],mult.inputs[2]);source=mult.outputs[0]
    if not face:
        geom=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.45,-.65,.72);L.new(geom.outputs['Normal'],dot.inputs[0])
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='CONSTANT';ramp.color_ramp.elements[0].position=.03;ramp.color_ramp.elements[0].color=(.46,.50,.54,1);ramp.color_ramp.elements[1].position=.43;ramp.color_ramp.elements[1].color=(1,1,1,1)
        mid=ramp.color_ramp.elements.new(.20);mid.color=(.74,.77,.79,1);L.new(dot.outputs['Value'],ramp.inputs[0])
        mult=n.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1;L.new(source,mult.inputs[1]);L.new(ramp.outputs['Color'],mult.inputs[2]);source=mult.outputs[0]
    L.new(source,emit.inputs['Color'])
    if tex and face:
        transparent=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');L.new(tex.outputs['Alpha'],mix.inputs[0]);L.new(transparent.outputs[0],mix.inputs[1]);L.new(emit.outputs[0],mix.inputs[2]);L.new(mix.outputs[0],out.inputs[0])
    else:L.new(emit.outputs[0],out.inputs[0])
    return m

ink=bpy.data.materials.new('Review outline ink');ink.diffuse_color=(.012,.020,.027,1);ink.use_nodes=True;ink.use_backface_culling=True
bs=ink.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.012,.020,.027,1);bs.inputs['Roughness'].default_value=1
nt=ink.node_tree;n=nt.nodes;L=nt.links
geom=n.new('ShaderNodeNewGeometry');transparent=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader')
L.new(geom.outputs['Backfacing'],mix.inputs[0]);L.new(bs.outputs[0],mix.inputs[1]);L.new(transparent.outputs[0],mix.inputs[2]);L.new(mix.outputs[0],n.get('Material Output').inputs[0])

def assembly(name):
    record=json.loads((INPUT/(name+'.json')).read_text());objects=[]
    for data in record['meshes']:
        vertices=[co(v)for v in data['vertices']];indices=data['index'];faces=[indices[i:i+3]for i in range(0,len(indices),3)]
        mesh=bpy.data.meshes.new(data['name']);mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new(data['name'],mesh);scene.collection.objects.link(o);objects.append(o);o['assetId']=data['asset'];o['runtimeAssembly']=name
        specs=data['materials']
        for spec in specs:mesh.materials.append(material(spec,data['asset'].startswith('face-')))
        for group in data['groups']:
            for p in mesh.polygons[group['start']//3:(group['start']+group['count'])//3]:p.material_index=group['materialIndex']
        for p in mesh.polygons:p.use_smooth=data['asset'].startswith(('body-','head-','hair-'))
        if data['colors']:
            attr=mesh.color_attributes.new(name='Pigment',type='FLOAT_COLOR',domain='CORNER')
            for l in mesh.loops:attr.data[l.index].color=data['colors'][l.vertex_index]
        if data['uv']:
            uv=mesh.uv_layers.new(name='UVMap')
            for l in mesh.loops:uv.data[l.index].uv=(data['uv'][l.vertex_index][0],1-data['uv'][l.vertex_index][1])
        if data['asset'].startswith('face-'):
            o['projection']=specs[0].get('projection','front')
        # Thin inverted hull review outline. Shipping ComicStyle uses its own
        # screen-space outline; this source review does not claim pixel parity.
        elif data['asset'].startswith(('hair-','head-')):
            outline=o.copy();outline.data=o.data.copy();outline.name='Review ink · '+o.name;scene.collection.objects.link(outline);objects.append(outline)
            outline.data.materials.clear();outline.data.materials.append(ink)
            for v in outline.data.vertices:v.co+=v.normal*.0013
            bm=bmesh.new();bm.from_mesh(outline.data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(outline.data);bm.free()
    return objects,record

def aim(obj,p):obj.rotation_euler=(Vector(co(p))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Sunline review camera');camera=bpy.data.objects.new('Sunline review camera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
light=bpy.data.lights.new('Review softbox','AREA');light.energy=450;light.size=5;obj=bpy.data.objects.new('Review softbox',light);scene.collection.objects.link(obj);obj.location=co((-3,5,4));aim(obj,(0,1,0))
all_records=[]
for name,views in [('neutral',[('front',(0,1.16,5),2.30,(0,1.08,0)),('side',(5,1.16,.02),2.30,(0,1.08,0)),('back',(0,1.16,-5),2.30,(0,1.08,0))]),('lean-wave',[('pose',(3.2,1.7,7),2.40,(0,1.12,0))]),('broad-run',[('pose',(4,1.7,7),2.45,(0,1.10,0)),('back',(-3,1.7,-7),2.45,(0,1.10,0))]),('deep-run',[('front',(0,1.16,5),2.3,(0,1.08,0)),('side',(5,1.16,.02),2.3,(0,1.08,0)),('back',(0,1.16,-5),2.3,(0,1.08,0))]),('broad-wave',[('pose',(3.2,1.7,7),2.4,(0,1.10,0))]),('broad-neutral',[('front',(0,1.16,5),2.30,(0,1.08,0)),('back',(0,1.16,-5),2.30,(0,1.08,0))])]:
    objects,record=assembly(name)
    for label,pos,scale,target in views:
        camera.location=co(pos);aim(camera,target);data.ortho_scale=scale
        side=abs(pos[0])>abs(pos[2])*2
        for o in objects:
            if 'projection'in o:o.hide_render=(o['projection']=='front')if side else(o['projection']=='profile')
        scene.render.filepath=str(OUT/(name+'-'+label+'.png'));bpy.ops.render.render(write_still=True)
    all_records.append({k:record[k]for k in ['name','recipe','diagnostics']})
    if name=='neutral':
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/sunline-review.blend'))
    for o in objects:bpy.data.objects.remove(o,do_unlink=True)
(OUT/'runtime-assemblies.json').write_text(json.dumps(all_records,indent=2)+'\n')
# A single interactive review scene preserves three already-runtime-posed looks.
# These meshes are inspection copies; editable skinning lives in the source file.
for name,offset in [('neutral',-1.05),('broad-wave',0),('broad-run',1.05)]:
    objects,_=assembly(name)
    for obj in objects:
        obj.location.x+=offset
        if 'projection'in obj:
            obj.hide_render=obj['projection']=='profile'
            obj.hide_set(obj['projection']=='profile')
camera.location=co((0,1.3,6));aim(camera,(0,1.08,0));data.ortho_scale=4.2
scene.render.resolution_x=1500;scene.render.resolution_y=850
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/sunline-review.blend'),compress=True)
