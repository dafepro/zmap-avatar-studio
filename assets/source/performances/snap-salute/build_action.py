"""Editable original action on the unchanged named avatar rig.

Run: blender -b --python assets/source/performances/snap-salute/build_action.py
This rig-only source action complements runtime-generated mesh review images.
It does not rebuild any body, clothing or hair model.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Matrix, Quaternion, Vector
ROOT=Path(__file__).resolve().parents[4]
HERE=Path(__file__).resolve().parent
record=json.loads((HERE/'baked-clip.json').read_text())
catalog=json.loads((ROOT/'public/catalog.json').read_text())
source=json.loads((HERE/'keyframes.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.name='Original Snap Salute action';scene.render.fps=60;scene.frame_start=1;scene.frame_end=145
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
positions={};sockets=catalog['rig']['sockets'];byid={s['id']:s for s in sockets}
for socket in sockets:positions[socket['id']]=Vector(socket['position'])+(positions[socket['parent']]if socket['parent']else Vector())
armature=bpy.data.armatures.new('athlete-reference-v2');rig=bpy.data.objects.new('Snap Salute · original action',armature);scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);rig.show_in_front=True
bpy.ops.object.mode_set(mode='EDIT')
preferred={'root':'hips','hips':'chest','chest':'head','arm_L':'forearm_L','forearm_L':'hand_L','leg_L':'shin_L','shin_L':'foot_L','arm_R':'forearm_R','forearm_R':'hand_R','leg_R':'shin_R','shin_R':'foot_R'}
for socket in sockets:
    name=socket['id'];bone=armature.edit_bones.new(name);bone.head=(C@positions[name].to_4d()).to_3d()
    tail=positions[preferred[name]]if name in preferred else positions[name]+Vector((0,.10,0))
    bone.tail=(C@tail.to_4d()).to_3d()
    if socket['parent']:bone.parent=armature.edit_bones[socket['parent']]
bpy.ops.object.mode_set(mode='OBJECT')
for bone in rig.pose.bones:bone.rotation_mode='QUATERNION'
rig['rig_id']='athlete-reference-v2';rig['source']='Original target-authored motion. Runtime applies its own bounded entry/exit blends and ground support.'
rig['individual_finger_animation']=False
rest={bone.name:bone.matrix_local.copy()for bone in armature.bones}
for frame in record['clip']['frames']:
    world={};quaternions={name:frame['rotations'][i*4:i*4+4]for i,name in enumerate(record['bones'])}
    for socket in sockets:
        name=socket['id'];q=quaternions.get(name,[0,0,0,1]);local=Matrix.Translation(Vector(socket['position']))@Quaternion((q[3],q[0],q[1],q[2])).to_matrix().to_4x4()
        world[name]=(world[socket['parent']]if socket['parent']else Matrix.Identity(4))@local
    frame_number=round(frame['time']*60)+1
    desired={name:C@world[name]@Matrix.Translation(-positions[name])@C.inverted()@rest[name]for name in world}
    for socket in sockets:
        name=socket['id'];bone=rig.pose.bones[name];parent=socket['parent']
        local_rest=(rest[parent].inverted()if parent else Matrix.Identity(4))@rest[name]
        bone.matrix_basis=local_rest.inverted()@(desired[parent].inverted()if parent else Matrix.Identity(4))@desired[name]
        bone.keyframe_insert(data_path='rotation_quaternion',frame=frame_number,group=name)
        bone.keyframe_insert(data_path='location',frame=frame_number,group=name)
    bpy.context.view_layer.update()
rig.animation_data.action.name='Snap Salute · original 2.4s'
for curve in rig.animation_data.action.fcurves:
    for key in curve.keyframe_points:key.interpolation='LINEAR'
for key in source['keys']:scene.timeline_markers.new(key['phase'].upper(),frame=round(key['time']*60)+1)
image=bpy.data.images.load(str(ROOT/'docs/references/snap-salute/concept.png'));image.pack()
max_position=0;max_rotation=0
for index in [0,17,43,61,80,105,144]:
    frame=record['clip']['frames'][index];scene.frame_set(index+1);world={}
    quaternions={name:frame['rotations'][i*4:i*4+4]for i,name in enumerate(record['bones'])}
    for socket in sockets:
        name=socket['id'];q=quaternions.get(name,[0,0,0,1]);local=Matrix.Translation(Vector(socket['position']))@Quaternion((q[3],q[0],q[1],q[2])).to_matrix().to_4x4()
        world[name]=(world[socket['parent']]if socket['parent']else Matrix.Identity(4))@local
        expected=C@world[name]@Matrix.Translation(-positions[name])@C.inverted()@rest[name]
        actual=rig.pose.bones[name].matrix
        max_position=max(max_position,(actual.translation-expected.translation).length)
        max_rotation=max(max_rotation,actual.to_quaternion().rotation_difference(expected.to_quaternion()).angle)
assert max_position<0.00001,(max_position,max_rotation)
assert max_rotation<0.001,(max_position,max_rotation)
(HERE/'action-verification.json').write_text(json.dumps({'sampleFrames':[1,18,44,62,81,106,145],'maxPositionErrorMetres':max_position,'maxRotationErrorRadians':max_rotation,'source':'Editable Blender action compared against the baked target-rig matrices'},indent=2)+'\n')
scene.frame_set(44);bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'snap-salute-action.blend'),compress=True)
print('SNAP_SALUTE_ACTION_READY',len(rig.pose.bones),scene.frame_end,flush=True)
