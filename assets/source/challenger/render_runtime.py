"""Render actual posed/fitted runtime snapshots with Blender's review cel materials.

This is Blender evidence, NOT browser/ComicStyle evidence. Generate snapshots:
node --import tsx scripts/challenger-runtime-snapshot.ts
Then: blender -b --python assets/source/challenger/render_runtime.py
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'docs/evidence/challenger'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=32
scene.cycles.use_denoising=False
scene.render.resolution_x=scene.render.resolution_y=600
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=True
scene.world.color=(.8,.8,.8)
scene.view_settings.view_transform='Standard'
scene.view_settings.look='Medium High Contrast' if 'Medium High Contrast' in [i.name for i in scene.view_settings.bl_rna.properties['look'].enum_items] else 'None'
art=bpy.data.images.load(str(ROOT/'assets/textures/face-challenger.png'))

def material(data, yaw):
    m=bpy.data.materials.new(data['name']);m.use_nodes=True
    n=m.node_tree.nodes;l=m.node_tree.links;n.clear();out=n.new('ShaderNodeOutputMaterial')
    emit=n.new('ShaderNodeEmission');emit.inputs['Color'].default_value=(*data['color'],1)
    if data['texture']:
        tex=n.new('ShaderNodeTexImage');tex.image=art;l.new(tex.outputs['Color'],emit.inputs['Color'])
        # The runtime's exact bounded camera-angle blend, sampled at this view.
        q=max(0,min(1,(abs(math.cos(math.radians(yaw)))-.2)/.25))
        profile=1-q*q*(3-2*q);weight=profile if data['projection']=='profile' else 1-profile
        alpha=n.new('ShaderNodeMath');alpha.operation='MULTIPLY';alpha.inputs[1].default_value=weight;l.new(tex.outputs['Alpha'],alpha.inputs[0])
        geo=n.new('ShaderNodeNewGeometry');one=n.new('ShaderNodeMath');one.operation='SUBTRACT';one.inputs[0].default_value=1;l.new(geo.outputs['Backfacing'],one.inputs[1]);cull=n.new('ShaderNodeMath');cull.operation='MULTIPLY';l.new(alpha.outputs[0],cull.inputs[0]);l.new(one.outputs[0],cull.inputs[1])
        transparent=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader')
        l.new(cull.outputs[0],mix.inputs[0]);l.new(transparent.outputs[0],mix.inputs[1]);l.new(emit.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],out.inputs[0])
        m.surface_render_method='DITHERED';m.use_backface_culling=True
    else:
        geom=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.4,-.65,.65);l.new(geom.outputs['Normal'],dot.inputs[0])
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='CONSTANT'
        ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1]);ramp.color_ramp.elements[0].position=.1;ramp.color_ramp.elements[0].color=(.46,.46,.51,1)
        mid=ramp.color_ramp.elements.new(.35);mid.color=(.78,.78,.78,1)
        top=ramp.color_ramp.elements.new(.7);top.color=(1,1,1,1);l.new(dot.outputs['Value'],ramp.inputs[0])
        mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;mul.inputs[1].default_value=(*data['color'],1);l.new(ramp.outputs[0],mul.inputs[2]);l.new(mul.outputs[0],emit.inputs['Color']);l.new(emit.outputs[0],out.inputs[0])
    return m

def load(name,yaw,head_only):
    for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if not mesh.users:bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if not mat.users:bpy.data.materials.remove(mat)
    data=json.loads((ROOT/'outputs/challenger'/f'{name}.json').read_text())
    for entry in data['meshes']:
        if head_only and not entry['assetId'].startswith(('head-','face-')):continue
        vertices=[(x,-z,y) for x,y,z in entry['positions']]
        ids=entry['indices'];faces=[ids[i:i+3] for i in range(0,len(ids),3)]
        mesh=bpy.data.meshes.new(entry['name']);mesh.from_pydata(vertices,[],faces);mesh.update()
        obj=bpy.data.objects.new(entry['name'],mesh);scene.collection.objects.link(obj)
        for mat in entry['materials']:mesh.materials.append(material(mat,yaw))
        for polygon in mesh.polygons:polygon.use_smooth=entry['assetId'].startswith(('head-','face-'))
        for group in entry['groups']:
            for i in range(group['start']//3,(group['start']+group['count'])//3):mesh.polygons[i].material_index=group['materialIndex']
        if entry['uv']:
            uv=mesh.uv_layers.new(name='Original GLB UVs')
            for polygon in mesh.polygons:
                for li in polygon.loop_indices:u,v=entry['uv'][mesh.loops[li].vertex_index];uv.data[li].uv=(u,1-v)  # glTF top-origin texture convention to Blender
    camera_data=bpy.data.cameras.new('Runtime review camera');camera=bpy.data.objects.new('Runtime review camera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
    camera_data.type='ORTHO';camera_data.ortho_scale=.59 if head_only else 2.28
    center=Vector((0,0,1.81 if head_only else 1.04));a=math.radians(yaw)
    camera.location=center+Vector((math.sin(a)*5,-math.cos(a)*5,.02 if head_only else .55))
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()

selected=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for head in ['head-scout','head-spark']:
    if selected and head!=selected[0]:continue
    for yaw,label in [(0,'front'),(-45,'left-oblique'),(45,'right-oblique'),(-90,'left-profile'),(90,'right-profile')]:
        load(f'runtime-{head}-idle',yaw,True);scene.render.filepath=str(OUT/f'blender-{head}-{label}.png');bpy.ops.render.render(write_still=True)
    for pose,yaw in [('run',-18),('wave',22)]:
        load(f'runtime-{head}-{pose}',yaw,False);scene.render.filepath=str(OUT/f'blender-{head}-{pose}.png');bpy.ops.render.render(write_still=True)
print('CHALLENGER_RUNTIME_VIEWS_COMPLETE')
