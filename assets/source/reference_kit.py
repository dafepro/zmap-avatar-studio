"""Reference component kit, authored in a dedicated *interactive* Blender scene.

Run through Blender MCP with __file__ set to this file. Re-running replaces only
the scene/objects tagged zmap_reference; other open work is never reset.
Coordinates below are metres, Y up, +Z forward. The three supplied studies are
the source of the silhouette landmarks. No generated image is used as geometry.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
for obj in list(bpy.data.objects):
    if obj.get('zmap_reference'): bpy.data.objects.remove(obj, do_unlink=True)
scene = bpy.data.scenes.get('Zoomap · reference components')
if scene is None: scene = bpy.data.scenes.new('Zoomap · reference components')
bpy.context.window.scene = scene
before = set(bpy.data.objects)

# Shared GLB writer; this never resets the user's open Blender file.
exec(compile((ROOT/'assets/source/kit_io.py').read_text(), 'kit_io.py', 'exec'), globals())
for channel in channels: globals()[channel]['paletteChannel'] = channel

def color(material, value):
    values=[int(value[i:i+2],16)/255 for i in (1,3,5)]
    values=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]
    material.diffuse_color=(*values,1)
    material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*values,1)

for m,c in [(primary,'#f4f1eb'),(secondary,'#292b2d'),(trim,'#f5f2eb'),
            (skin,'#d3a17a'),(hair,'#594333'),(ink,'#191d20'),(sole,'#e9e7e3')]: color(m,c)

sockets=[{'id':'root','parent':None,'position':[0,0,0]},
         {'id':'hips','parent':'root','position':[0,.99,0]},
         {'id':'chest','parent':'hips','position':[0,.31,0]},
         {'id':'head','parent':'chest','position':[0,.51,0]}]
for sign,side in [(-1,'L'),(1,'R')]:
    sockets += [{'id':'arm_'+side,'parent':'chest','position':[sign*.204,.155,0]},
                {'id':'forearm_'+side,'parent':'arm_'+side,'position':[sign*.065,-.270,0]},
                {'id':'hand_'+side,'parent':'forearm_'+side,'position':[sign*.064,-.217,.007]},
                {'id':'leg_'+side,'parent':'hips','position':[sign*.110,0,0]},
                {'id':'shin_'+side,'parent':'leg_'+side,'position':[sign*.060,-.43,.013]},
                {'id':'foot_'+side,'parent':'shin_'+side,'position':[sign*.055,-.44,-.003]}]
positions={}
for s in sockets: positions[s['id']]=Vector(s['position'])+(positions[s['parent']] if s['parent'] else Vector())
old_asset=asset
def asset(id,label,slot,description):
    root,record=old_asset(id,label,slot,description);record['rig']='athlete-reference-v2';return root,record
def mount(root,record,socket):
    obj=empty('ref2_'+record['id']+'__'+socket,root)
    record['attachments'].append({'node':obj.name,'socket':socket});return obj

def smooth(o):
    for poly in o.data.polygons: poly.use_smooth=True
    return o

def ease(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def planar(o):
    """Intentional broad planes; welded normals belong only to the ink shell."""
    for poly in o.data.polygons: poly.use_smooth=False
    return o

def section(name, rows, material, parent=None, n=12, cap=True):
    # y, centre x, centre z, width radius, depth radius. Elliptical sweeps keep
    # joint positions anatomical while the silhouette is independently authored.
    verts=[]
    for y,x,z,rx,rz in rows:
        for i in range(n):
            a=2*math.pi*i/n;verts.append((x+rx*math.sin(a),y,z+rz*math.cos(a)))
    faces=[]
    if cap: faces += [tuple(reversed(range(n))),tuple(range((len(rows)-1)*n,len(rows)*n))]
    for row in range(len(rows)-1):
        for i in range(n):
            a=row*n+i;b=row*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    return mesh(name,verts,faces,material,parent)

def tube(name,points,radius,material,parent=None,n=6):
    verts=[];points=[Vector(p) for p in points]
    for i,p in enumerate(points):
        tangent=(points[min(i+1,len(points)-1)]-points[max(0,i-1)]).normalized()
        u=tangent.cross(Vector((0,0,1)))
        if u.length<.001:u=tangent.cross(Vector((0,1,0)))
        u.normalize();v=tangent.cross(u).normalized()
        for j in range(n):verts.append(tuple(p+radius*(math.cos(j*math.tau/n)*u+math.sin(j*math.tau/n)*v)))
    faces=[tuple(reversed(range(n))),tuple(range((len(points)-1)*n,len(points)*n))]
    for i in range(len(points)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;faces.append((a,b,b+n,a+n))
    return mesh(name,verts,faces,material,parent)

def bind(root,record,objects,kind):
    """One skeleton and one continuous rest-space weight field per component."""
    p=mount(root,record,'root')
    data=bpy.data.armatures.new(record['id']+' skeleton')
    arm=bpy.data.objects.new(record['id']+' skeleton',data);scene.collection.objects.link(arm);arm.parent=p
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
    for s in sockets:
        bone=data.edit_bones.new(s['id']);bone.head=co(positions[s['id']]);bone.tail=Vector(bone.head)+Vector((0,0,.06))
        if s['parent']:bone.parent=data.edit_bones[s['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in objects:
        obj.parent=p
        for s in sockets:obj.vertex_groups.new(name=s['id'])
        reach_field={}
        if obj.name.startswith('Continuous V-neck jersey'):
            adjacent=[set() for _ in obj.data.vertices]
            for edge in obj.data.edges:
                a,b=edge.vertices;adjacent[a].add(b);adjacent[b].add(a)
            fixed={}
            for v in obj.data.vertices:
                ax,y=abs(v.co.x),v.co.z
                if ax<.115 or (y<1.28 and ax<.205):fixed[v.index]=0.0
                elif ax>.305 or (y<1.34 and ax>.208):fixed[v.index]=1.0
                reach_field[v.index]=fixed.get(v.index,ease(.115,.305,ax))
            free=[i for i in reach_field if i not in fixed and adjacent[i]]
            for _ in range(160):
                values={i:sum(reach_field[j] for j in adjacent[i])/len(adjacent[i]) for i in free}
                reach_field.update(values)
        for v in obj.data.vertices:
            x,y,z=v.co.x,v.co.z,-v.co.y;ax=abs(x);side='R' if x>=0 else 'L'
            family=obj.get('family',kind)
            if family=='anatomy':family='leg' if y<.72 or (y<1.07 and ax<.235) else 'body'
            if family=='hand': weights={'hand_'+side:1}
            elif family=='leg':
                hip=ease(.88,1.01,y);knee=1-ease(.49,.64,y);foot=1-ease(.105,.19,y)
                weights={'hips':hip,'leg_'+side:(1-hip)*(1-knee),'shin_'+side:(1-hip)*knee*(1-foot),'foot_'+side:(1-hip)*knee*foot}
            elif family=='bottom':
                hip=ease(.895,1.055,y);weights={'hips':hip,'leg_'+side:1-hip}
            else:
                # The shared field gives skin and jersey exactly the same shoulder
                # reach. Below the armpit, torso x cannot accidentally become arm.
                shoulder=ease(1.20,1.40,y)
                reach=ease(.175-.035*shoulder,.210+.025*shoulder,ax)
                reach=reach_field.get(v.index,reach)
                fore=1-ease(1.13,1.245,y);wrist=1-ease(.945,1.005,y)
                hip=1-ease(1.02,1.22,y)
                weights={'chest':(1-reach)*(1-hip),'hips':(1-reach)*hip,
                         'arm_'+side:reach*(1-fore),'forearm_'+side:reach*fore*(1-wrist),'hand_'+side:reach*fore*wrist}
            weights={k:w for k,w in weights.items() if w>1e-5};total=sum(weights.values())
            for bone,w in weights.items():obj.vertex_groups[bone].add([v.index],w/total,'REPLACE')
        modifier=obj.modifiers.new('Shared reference skeleton','ARMATURE');modifier.object=arm
    record['skin']={'bones':[s['id'] for s in sockets]}

def torso_surface(name, garment=False):
    """Manifold shoulder branches: sleeves/arms share the torso's edge vertices.

    Each arm starts in a six-edge side opening. No intersecting shoulder balls,
    voxel seam, separate deltoid cap, or cylindrical neck resting on a shirt.
    """
    rows=([(1.009,.203,.128),(1.05,.196,.126),(1.15,.168,.118),(1.29,.173,.119),
           (1.355,.188,.120),(1.492,.214,.112),(1.528,.087,.118),(1.548,.063,.108)] if garment else
          [(.945,.147,.103),(1.03,.153,.101),(1.14,.127,.087),(1.29,.162,.112),
           (1.355,.171,.106),(1.492,.200,.082),(1.552,.052,.047),(1.665,.048,.049)])
    verts=[];faces=[];dark=[];n=16
    for r,(y,rx,rz) in enumerate(rows):
        for j in range(n):
            a=j*math.tau/n;x=math.sin(a)*rx;z=math.cos(a)*rz
            yy=y
            if garment:
                if r==0:yy+=.013*abs(math.sin(a))-.007*math.cos(2*a)
                if r==5:yy-=.117*max(0,1-abs(x)/.15)*max(0,math.cos(a))
                if r>=len(rows)-2:yy-=.085*max(0,math.cos(a))**1.6 # V neckline
                if r>=len(rows)-2 and math.cos(a)<0:z*=.60
            verts.append((x,yy,z))
    for r in range(len(rows)-1):
        for j in range(n):
            if r==4 and j in [3,4,11,12]:continue
            a=r*n+j;b=r*n+(j+1)%n;faces.append((a,b,b+n,a+n))
            if garment and r==len(rows)-2:dark.append(len(faces)-1)
    # Arm branches ordered around the outward-facing side opening.
    for sign,side,indices in [(1,'R',[67,68,69,85,84,83]),(-1,'L',[77,76,75,91,92,93])]:
        path=([(1.427,.221,.063,.085),(1.323,.265,.059,.073),(1.301,.273,.058,.073)] if garment else
              [(1.427,.209,.051,.061),(1.325,.233,.051,.055),(1.20,.266,.035,.041),
               (1.15,.282,.047,.048),(1.075,.304,.040,.044),(.973,.334,.026,.031)])
        last=indices
        for step,(y,x,ry,rz) in enumerate(path):
            ids=[]
            for ay,az in [(-.5,.866),(-1,0),(-.5,-.866),(.5,-.866),(1,0),(.5,.866)]:
                ids.append(len(verts));verts.append((sign*(x+ay*ry),y+ay*ry*.24,az*rz+.004))
            for i in range(6):
                faces.append((last[i],last[(i+1)%6],ids[(i+1)%6],ids[i]))
                if garment and step==len(path)-1:dark.append(len(faces)-1)
            last=ids
        if not garment:faces.append(tuple(last))
    obj=mesh(name,verts,faces,primary if garment else skin,None)
    if not garment:
        bm=bmesh.new();bm.from_mesh(obj.data)
        boundary=[edge for edge in bm.edges if edge.is_boundary]
        bmesh.ops.holes_fill(bm,edges=boundary,sides=32);bm.to_mesh(obj.data);bm.free()
    if garment:
        obj.data.materials.append(secondary)
        for i in dark:obj.data.polygons[i].material_index=1
    return obj

def hand_mesh(sign):
    # Natural relaxed hand: tapered palm, offset knuckles, four distinct curled
    # fingers, opposed thumb. Only the tiny hand is welded; no body remeshing.
    cx=sign*.334;top=.983;parts=[]
    palm=section('Palm',[(top,cx,.007,.027,.028),(.940,cx+sign*.012,.007,.044,.027),
                         (.883,cx+sign*.023,.010,.038,.024)],skin,n=8);parts.append(palm)
    for i,(offset,length) in enumerate([(-.027,.080),(-.009,.095),(.011,.087),(.029,.068)]):
        x=cx+sign*(.023+offset);y=.899-abs(offset)*.18
        points=[(x,y,.010),(x+sign*.004,y-length*.55,.024),
                (x-sign*.002,y-length,.027),(x-sign*.011,y-length+.002,.039)]
        parts.append(tube('Relaxed finger '+str(i),points,.011 if i<3 else .0095,skin,n=6))
    parts.append(tube('Opposed thumb',[(cx-sign*.026,.938,.016),(cx-sign*.047,.907,.039),
                                    (cx-sign*.047,.874,.055),(cx-sign*.034,.862,.061)],.015,skin,n=8))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=palm;bpy.ops.object.join()
    palm.data.remesh_voxel_size=.003;bpy.ops.object.voxel_remesh()
    mod=palm.modifiers.new('Relax knuckles','SMOOTH');mod.factor=.35;mod.iterations=2;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=palm.modifiers.new('Broad hand planes','DECIMATE');mod.ratio=.07;bpy.ops.object.modifier_apply(modifier=mod.name)
    palm.name='Relaxed five-finger hand';palm['family']='hand';return planar(palm)

def make_body():
    r,d=asset('body-athletic','Reference athlete','body','Fixed-height reference anatomy: connected collarbone and shoulders, long athletic legs, relaxed five-finger hands.')
    objects=[torso_surface('Connected clavicle, torso and arms')]
    pelvis=section('Shaped pelvis',[(.987,0,0,.147,.101),(.95,0,0,.126,.096),(.927,0,.003,.034,.054)],skin,n=12)
    pelvis['family']='leg';objects.append(pelvis)
    for sign in [-1,1]:
        leg=section('Athletic leg',[(.996,sign*.093,-.005,.078,.093),(.876,sign*.113,-.010,.080,.087),
            (.71,sign*.146,-.003,.061,.066),(.568,sign*.170,.014,.043,.047),
            (.505,sign*.184,.009,.054,.055),(.397,sign*.198,-.012,.063,.060),
            (.23,sign*.219,-.009,.037,.038),(.120,sign*.225,.01,.031,.033)],skin,n=10)
        leg['family']='leg';objects.append(leg);objects.append(hand_mesh(sign))
        foot=section('Bare foot',[(.12,sign*.225,.018,.032,.04),(.07,sign*.225,.062,.068,.105),
                                 (.018,sign*.225,.083,.086,.133),(.010,sign*.225,.085,.083,.132)],skin,n=12)
        foot['family']='leg';objects.append(foot)
    # Weld the pelvis/leg/foot volumes into continuous lower-body anatomy. The
    # deliberately constructed clavicle and arm topology is retained above it.
    lower=[o for o in objects if o.get('family')!='hand']
    upper=[o for o in objects if o.get('family')=='hand']
    for sign in [-1,1]:
        for i in range(5):
            x=sign*.225+(i-2)*.031
            toe=tube('Bare toe',[(x,.033,.174),(x,.027,.217+(2-i)*.004)],.015 if i<3 else .012,skin,n=6)
            lower.append(toe)
    bpy.ops.object.select_all(action='DESELECT')
    for o in lower:o.select_set(True)
    bpy.context.view_layer.objects.active=lower[0];bpy.ops.object.join();lower_body=lower[0]
    lower_body.data.remesh_voxel_size=.006;bpy.ops.object.voxel_remesh()
    mod=lower_body.modifiers.new('Anatomical transitions','SMOOTH');mod.factor=.3;mod.iterations=2;bpy.ops.object.modifier_apply(modifier=mod.name)
    lower_body.data.calc_loop_triangles();mod=lower_body.modifiers.new('Anatomy surface budget','DECIMATE');mod.ratio=min(1,2000/len(lower_body.data.loop_triangles));bpy.ops.object.modifier_apply(modifier=mod.name)
    lower_body.name='Reference continuous anatomy';lower_body['family']='anatomy'
    objects=upper+[lower_body]
    # Standard game-avatar body occlusion groups. A garment declares the body
    # regions it covers; the full anatomy remains in the same source GLB for the
    # base-mesh view. Cut boundaries are under cuffs, hems and the V binding.
    partitioned=[]
    for obj in objects:
        if obj.get('family')=='hand':partitioned.append(obj);continue
        bm=bmesh.new();bm.from_mesh(obj.data)
        if obj.get('family')=='anatomy':
            planes=[((0,1.31,0),(0,1,0)),((0,1.548,0),(0,1,0)),
                    ((0,1.457,0),(-1.5,1,0)),((0,1.457,0),(1.5,1,0)),((0,0,0),(0,0,1)),
                    ((0,.779,0),(0,1,0)),((0,.323,0),(0,1,0)),((0,1.07,0),(0,1,0))]
        elif obj.get('family')=='leg' and not obj.name.startswith(('Bare foot','Shaped pelvis')):
            planes=[((0,.779,0),(0,1,0)),((0,.323,0),(0,1,0))]
        else:planes=[]
        for point,normal in planes:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=co(point),plane_no=co(normal),clear_inner=False,clear_outer=False)
        bm.verts.ensure_lookup_table();bm.verts.index_update()
        groups={}
        for face in bm.faces:
            c=face.calc_center_median();x,y,z=c.x,c.z,-c.y
            if obj.get('family')=='anatomy' and (y<.72 or (y<1.07 and abs(x)<.235)):region='upper-legs' if y>.779 else ('feet' if y<.323 else '')
            elif obj.name.startswith('Bare foot'):region='feet'
            elif obj.name.startswith('Shaped pelvis'):region='upper-legs'
            elif obj.get('family')=='leg':region='upper-legs' if y>.779 else ('feet' if y<.323 else '')
            else:
                neck=y>=1.548 or (z>=0 and y>=1.457+1.5*abs(x))
                region='' if neck or (abs(x)>.20 and y<1.31) else 'torso'
            groups.setdefault(region,[]).append(tuple(v.index for v in face.verts))
        vs=[(v.co.x,v.co.z,-v.co.y) for v in bm.verts]
        for region,faces in groups.items():
            used=sorted({i for f in faces for i in f});mapping={old:i for i,old in enumerate(used)}
            part=mesh(obj.name+' · '+(region or 'exposed'),[vs[i] for i in used],[tuple(mapping[i] for i in f) for f in faces],skin,None)
            if region:part['avatarRegion']=region
            if obj.get('family'):part['family']=obj['family']
            if obj.get('family')=='anatomy':smooth(part)
            partitioned.append(part)
        bm.free();bpy.data.objects.remove(obj,do_unlink=True)
    bind(r,d,partitioned,'body');export(r,d)

# Width and side profile are independent. The jaw/chin have deliberate breaks.
HEAD=[(-.208,.018,.149,.115),(-.188,.070,.160,.070),(-.162,.113,.170,.005),
      (-.105,.148,.172,-.078),(-.048,.166,.169,-.128),(.020,.171,.171,-.164),
      (.092,.174,.160,-.187),(.161,.145,.135,-.175),(.211,.094,.083,-.132),(.23,.006,-.013,-.017)]
def head_section(y):
    for a,b in zip(HEAD,HEAD[1:]):
        if y<=b[0]:
            t=max(0,min(1,(y-a[0])/(b[0]-a[0])));return tuple(a[i]+(b[i]-a[i])*t for i in (1,2,3))
    return HEAD[-1][1:]
def face_depth(x,y):
    rx,front,back=head_section(y)
    # Broad cheek/forehead planes with a narrow bevel at the temples.
    q=min(1,abs(x)/max(rx,.001));roll=1-max(0,1-q**3.5)**(1/3.5)
    z=front-(front-(front+back)*.5)*roll
    nose=max(0,1-abs(y+.077)/.052)*max(0,1-abs(x)/.033)
    return z+.029*nose
def head_rows():return sorted(set([a[0] for a in HEAD]+[-.13,-.077,-.025,.052,.13,.185]))
FRAME=[0,-.041,.326,.318]
def fit_spec(mode,offset):return {'targetSlot':'head','surface':'face-v2','frame':FRAME,'mode':mode,'offset':offset,'maxDistance':.085}

def make_head(id,label,wide=1):
    r,d=asset(id,label,'head','Angular chin, cheek bevels and compact skull traced from the supplied front/side study.');p=mount(r,d,'head')
    vs=[];faces=[];ys=head_rows();n=32
    for y in ys:
        rx,front,back=head_section(y)
        for i in range(n):
            a=i*math.tau/n;x=math.sin(a)*rx
            z=face_depth(x,y) if math.cos(a)>0 else (front+back)*.5+math.cos(a)*(front-back)*.5
            vs.append((x*wide,y,z))
    for row in range(len(ys)-1):
        for j in range(n):a=row*n+j;b=row*n+(j+1)%n;faces.append((a,b,b+n,a+n))
    faces += [tuple(reversed(range(n))),tuple(range((len(ys)-1)*n,len(ys)*n))]
    smooth(mesh('Designed head planes',vs,faces,skin,p))
    # Ear silhouette and inset are authored panels, not spherical knobs.
    for s in [-1,1]:
        outline=[(.157,-.058,-.009),(.177,-.019,-.011),(.211,-.027,-.013),(.224,-.065,-.007),(.202,-.102,.003),(.174,-.119,.007),(.158,-.100,.007)]
        v=[(s*x*wide,y,z+.015) for x,y,z in outline]+[(s*x*wide,y,z-.024) for x,y,z in outline]
        fs=[tuple(range(7)),tuple(reversed(range(7,14)))]+[(i,(i+1)%7,(i+1)%7+7,i+7) for i in range(7)]
        mesh('Angular ear',v,fs,skin,p)
        inset=[(s*x*wide,y,z) for x,y,z in [(.177,-.055,.009),(.199,-.039,.012),(.208,-.066,.015),(.194,-.089,.025),(.190,-.071,.027)]]
        obj=mesh('Drawn ear hollow',inset,[(0,1,2,3,4)],ink,p)
    d['surface']={'id':'face-v2','frame':[FRAME[0],FRAME[1],FRAME[2]*wide,FRAME[3]]};export(r,d)

def make_face(id,label,index,texture="face-ink.png"):
    r,d=asset(id,label,'face','Ink-painted almond eyes, strong brows and an expressive mouth fitted to the actual head surface.');p=mount(r,d,'head')
    art=bpy.data.images.load(str(ROOT/'assets/textures'/texture),check_existing=False)
    m=bpy.data.materials.new('face-ink');m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=art
    m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);m.node_tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha']);m.surface_render_method='DITHERED';m.use_backface_culling=True
    vs=[];uvs=[];ys=[-.185]+[y for y in head_rows() if -.162<=y<=.092]+[.13];columns=17
    for y in ys:
        rx,_,_=head_section(y)
        for j in range(columns):
            x=math.sin((j-8)*math.pi/16)*rx;vs.append((x,y,face_depth(x,y)+.001))
            u=max(.001,min(.999,x/FRAME[2]+.5));v=max(.001,min(.999,(y-FRAME[1])/FRAME[3]+.5))
            uvs.append(((index%2+u)/2,(1-index//2+v)/2))
    fs=[]
    for row in range(len(ys)-1):
        for j in range(columns-1):a=row*columns+j;fs.append((a,a+1,a+columns+1,a+columns))
    obj=smooth(mesh('Fitted expression paint',vs,fs,m,p));uv=obj.data.uv_layers.new(name='Expression atlas')
    for poly in obj.data.polygons:
        for li in poly.loop_indices:uv.data[li].uv=uvs[obj.data.loops[li].vertex_index]
    # Profile art lives on the real cheek and transitions by viewing angle. It is
    # still one expression asset and one atlas, independent of head width.
    m['expressionProjection']='front'
    profile=m.copy();profile.name='face-ink-profile';profile['expressionProjection']='profile'
    for sign in [-1,1]:
        vs=[];uvs=[];columns=14;profile_ys=[-.17]+[y for y in head_rows() if -.17<y<.09]+[.09];rows=len(profile_ys)
        for row in range(rows):
            y=profile_ys[row]
            rx,front,back=head_section(y)
            for col in range(columns):
                t=col/(columns-1);z=.025+t*(face_depth(0,y)-.026)
                lo=0;hi=rx
                for _ in range(24):
                    mid=(lo+hi)*.5
                    if face_depth(mid,y)>z:lo=mid
                    else:hi=mid
                x=sign*(lo+hi)*.5
                vs.append((x,y,z));uvs.append(((512+index*170+t*168+1)/1024,(512+(y+.17)/.26*512)/1024-0.5))
        faces=[]
        for row in range(rows-1):
            for col in range(columns-1):
                a=row*columns+col;faces.append((a,a+1,a+columns+1,a+columns))
        cheek=smooth(mesh('Profile expression paint',vs,faces,profile,p));uv=cheek.data.uv_layers.new(name='Expression atlas')
        for poly in cheek.data.polygons:
            for li in poly.loop_indices:uv.data[li].uv=uvs[cheek.data.loops[li].vertex_index]
    d['texture']={'maxDimension':1024,'maxCount':1};d['fit']=fit_spec('surface',.0015);d['fit']['projection']='radial';export(r,d)

def lock(name, outline, ridge, material, parent):
    # A closed broad wedge with a raised asymmetric ridge; adjacent wedge roots
    # overlap inside the scalp. Long edges, few masses, no radial cone tufts.
    n=len(outline);vs=outline+[ridge]+[(x,y,z-.032) for x,y,z in outline]
    fs=[(i,(i+1)%n,n) for i in range(n)]+[tuple(reversed(range(n+1,2*n+1)))]+[(i,n+1+i,n+1+(i+1)%n,(i+1)%n) for i in range(n)]
    return mesh(name,vs,fs,material,parent)

exec(compile((ROOT/'assets/source/scalp_foundation.py').read_text(), 'scalp_foundation.py', 'exec'),globals())

def make_hair(id,label,style):
    r,d=asset(id,label,'hair','A filled scalp and a few broad directional lock masses; all accessories fit this same source mesh.');p=mount(r,d,'head')
    scalp_foundation(p,label)
    masses=[
      # left outer fan; long fringe; central fringe; cowlick; upright right locks
      ([(-.042,.228,.124),(-.180,.245,.035),(-.287,.208,.034),(-.228,.181,.106),(-.324,.127,.100),(-.195,.117,.197)],(-.176,.194,.183)),
      ([(.044,.194,.191),(-.106,.212,.181),(-.246,.142,.139),(-.295,.051,.108),(-.177,.094,.211)],(-.112,.155,.238)),
      ([(.099,.173,.174),(-.042,.185,.235),(-.176,.075,.207),(-.188,.061,.176),(-.053,.075,.248)],(-.035,.144,.263)),
      ([(.116,.168,.175),(.014,.147,.244),(-.052,.075,.248),(-.055,.052,.193),(.072,.080,.202)],(.062,.139,.241)),
      ([(-.043,.219,.099),(-.198,.280,.005),(-.124,.211,-.090),(.090,.228,.010)],(-.034,.265,.045)),
      ([(.027,.214,.069),(.058,.295,.001),(.114,.252,.054),(.179,.130,.163),(.089,.129,.187)],(.099,.225,.111)),
      ([(.135,.156,.115),(.202,.259,-.003),(.216,.180,.038),(.182,.099,.129)],(.177,.186,.111)),
      ([(.141,.107,.158),(.191,.151,.059),(.270,.174,.036),(.215,.111,.091),(.191,-.058,.076)],(.209,.093,.146)),
    ]
    for i,(outline,ridge) in enumerate(masses):
        if style=='pony':
            outline=[(x*.92,y if i<4 else .19+(y-.19)*.45,z) for x,y,z in outline];ridge=(ridge[0]*.92,ridge[1],ridge[2])
        lock('Swept lock '+str(i+1),outline,ridge,hair,p)
    # The supplied overhead study flows diagonally out of a crown whorl.
    # Four staggered rear locks continue that flow instead of two symmetric
    # vertical shield-shaped panels hanging behind the ears.
    rear_masses=[
      ([(.05,.19,-.11),(-.10,.21,-.10),(-.19,.14,-.085),(-.218,.035,-.065),(-.12,.075,-.182)],(-.11,.145,-.20)),
      ([(.04,.20,-.12),(-.08,.17,-.18),(-.19,-.02,-.17),(-.148,-.118,-.128),(-.03,-.04,-.193)],(-.06,.08,-.228)),
      ([(.06,.198,-.126),(.15,.12,-.16),(.09,-.065,-.22),(-.033,-.15,-.142),(-.015,.065,-.225)],(.065,.075,-.239)),
      ([(.078,.19,-.098),(.166,.16,-.06),(.213,.037,-.07),(.146,-.096,-.127),(.062,.02,-.212)],(.15,.08,-.209)),
    ]
    for i,(outline,ridge) in enumerate(rear_masses):
        lock('Directional crown-to-nape '+str(i),outline,ridge,hair,p)
    if style=='pony':
        # A gathered root overlaps the occipital scalp and tail. The original
        # flat tail began behind the skull, leaving an air gap in profile.
        gathered=rings('Gathered pony root',[(.12,.060,.035,-.156),(.18,.067,.059,-.165),(.23,.043,.044,-.190),(.255,.028,.024,-.219)],hair,p,n=10)
        smooth(gathered)
        ico('Hair tie',(0,.239,-.218),(.044,.024,.030),secondary,p,2)
        # Solid taper with a kicked pointed end, not a hanging rectangular card.
        tail=rings('Pony tail volume',[(-.174,.004,.004,-.267),(-.112,.027,.027,-.310),(-.015,.057,.043,-.327),(.093,.064,.056,-.301),(.180,.050,.045,-.262),(.244,.030,.026,-.222)],hair,p,n=8)
        smooth(tail)
    if style=='curls':
        # Alternate swept cut retains broad masses; this is not the approved study.
        for obj in p.children:
            if obj.type=='MESH' and not obj.get('scalpFoundation'):
                for v in obj.data.vertices:v.co.x=-v.co.x;v.co.z=.02+(v.co.z-.02)*.88
    export(r,d)

def crown(name,x,y,z,scale,material,parent=None):
    points=[(-.5,.0),(-.62,.63),(-.27,.35),(0,.98),(.26,.36),(.63,.63),(.48,0)]
    vs=[(x+px*scale,y+py*scale,z) for px,py in points]
    return mesh(name,vs,[tuple(range(len(vs)))],material,parent)

def make_shirt(id,label,style):
    r,d=asset(id,label,'shirt','Connected V-neck athletic jersey with broad shoulder planes, bound cuffs, crown crest and drawn fabric folds.')
    d['covers']=['torso']
    obj=torso_surface('Continuous V-neck jersey',True);objects=[obj]
    # Neck and cuff bindings are material regions in the connected cloth mesh.
    # The chest crest is a true crown, deliberately very small like the reference.
    objects.append(crown('Chest crown',.092,1.366,.108,.038,ink))
    objects.append(crown('Crown inset',.092,1.371,.109,.022,primary))
    # Sparse drawn folds on the front cloth. Vertex colors multiply any shirt
    # palette, so white and colored jerseys share a single authored asset.
    fold_specs=[]
    for verts,value in fold_specs:
        fold=mesh('Painted fabric fold',verts,[(0,1,2)],primary,None)
        attr=fold.data.color_attributes.new(name='Cloth wash',type='FLOAT_COLOR',domain='CORNER')
        for c in attr.data:c.color=(value,value,value,1)
        objects.append(fold)
    if style=='track':
        objects.append(tube('Track zip',[(0,1.455,.071),(0,1.34,.117),(0,1.15,.11),(0,1.04,.118)],.0025,secondary))
    if style=='hoodie':
        # A second silhouette uses the same shoulders and has a folded hood.
        objects.append(section('Folded warm-up hood',[(1.49,0,-.073,.089,.060),(1.565,0,-.076,.087,.042),(1.59,0,-.083,.056,.031)],primary,n=12))
    cloth=primary.copy();cloth.name=id+' drawn cloth';cloth['paletteChannel']='primary'
    nodes=cloth.node_tree.nodes;links=cloth.node_tree.links;bs=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'assets/textures/garment-wash.png'),check_existing=True)
    multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=primary.diffuse_color
    links.new(tex.outputs['Color'],multiply.inputs[1]);links.new(multiply.outputs[0],bs.inputs['Base Color'])
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material==primary:slot.material=cloth
        uv=obj.data.uv_layers.new(name='Drawn cloth')
        for poly in obj.data.polygons:
            for li in poly.loop_indices:
                v=obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv=((v.x+.218)/.436,(v.z-.99)/.56) if -v.y>.06 and abs(v.x)<.218 else (.5,.5)
    d['texture']={'maxDimension':256,'maxCount':1}
    bind(r,d,objects,'shirt');export(r,d)

def make_bottom(id,label,long=False):
    r,d=asset(id,label,'bottom','Loose athletic shorts with a shaped crotch, elastic waist and full white side stripes.')
    d['covers']=['upper-legs'];objects=[]
    # One welded pair of shorts: front and back panels share a crotch vertex,
    # with a separate opening for each leg. No intersecting thigh cylinders.
    end=.714 if long else .767
    vs=[];fs=[]
    for front in [1,-1]:
        base=len(vs)
        for x,z in [(-.174,0),(-.146,.067),(-.104,.096),(-.052,.107),(0,.107),(.052,.107),(.104,.096),(.146,.067),(.174,0)]:vs.append((x,1.047,z*front))
        for x,z in [(-.187,0),(-.156,.085),(-.106,.123),(-.056,.105),(0,.074),(.056,.105),(.106,.123),(.156,.085),(.187,0)]:vs.append((x,.916 if x==0 else .948,z*front))
        for x,z in [(-.213,0),(-.178,.092),(-.128,.126),(-.067,.103),(-.025,0),(.025,0),(.067,.103),(.128,.126),(.178,.092),(.213,0)]:vs.append((x,end+(.01 if abs(x)<.04 else 0),z*front))
        for j in range(8):fs.append(tuple(base+i for i in (j,j+1,j+10,j+9)))
        for j in range(4):fs.append(tuple(base+i for i in (9+j,10+j,19+j,18+j)))
        for j in range(4):fs.append(tuple(base+i for i in (13+j,14+j,24+j,23+j)))
    fs += [(13,41,50,22),(13,23,51,41)]
    obj=mesh('Connected shaped court shorts',vs,fs,secondary,None)
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(obj.data);bm.free();objects.append(obj)
    objects.append(section('Elastic waistband',[(1.029,0,0,.174,.108),(1.058,0,0,.169,.104)],secondary,n=24,cap=False))
    for s in [-1,1]:
        objects.append(tube('White side stripe',[(s*.173,1.049,0),(s*.1875,.948,0),(s*.2135,end,0)],.0065,trim,n=6))
    objects.append(crown('Shorts crown',.120,end+.026,.102,.027,trim))
    bind(r,d,objects,'bottom');export(r,d)

def make_shoes(id,label,style):
    r,d=asset(id,label,'shoes','Reference sneakers: layered black and white panels, crossed black laces, sculpted outsole, tongue and heel loop, plain ribbed crew socks.')
    d['covers']=['feet']
    for side in ['L','R']:
        p=mount(r,d,'foot_'+side)
        # Socket-local shoe; floor is y=-.12. Outline is shaped in top view.
        outline=[(0,.194),(.051,.185),(.069,.132),(.065,.040),(.052,-.060),(.031,-.082),(-.031,-.082),(-.052,-.060),(-.065,.040),(-.069,.132),(-.051,.185)]
        n=len(outline);vs=[]
        for y,scale in [(-.119,.97),(-.107,1),(-.073,1),(-.061,.95)]:
            vs.extend((x*scale,y,z) for x,z in outline)
        fs=[tuple(reversed(range(n))),tuple(range(3*n,4*n))]
        for row in range(3):
            for j in range(n):a=row*n+j;b=row*n+(j+1)%n;fs.append((a,b,b+n,a+n))
        obj=mesh('Layered shaped midsole',vs,fs,sole,p);obj.data.materials.append(secondary)
        for poly in obj.data.polygons:
            if poly.index==0 or 2<=poly.index<2+n:poly.material_index=1
        # Longitudinal upper sections give a rounded toe box, a high instep,
        # and a real ankle opening. The tongue is supported by the vamp.
        vs=[];fs=[];section_count=10
        shoe_rows=[(-.078,.030,.026),(-.052,.048,.068),(-.012,.056,.082),(.041,.062,.055),(.108,.065,.013),(.161,.052,-.013),(.191,.011,-.029)]
        for z,width,top in shoe_rows:
            for j in range(section_count):
                a=j*math.tau/section_count;vs.append((math.sin(a)*width,(-.067+top)*.5+math.cos(a)*(top+.067)*.5,z))
        for row in range(len(shoe_rows)-1):
            for j in range(section_count):
                if row in [1,2] and j in [0,9]:continue
                a=row*section_count+j;b=row*section_count+(j+1)%section_count;fs.append((a,b,b+section_count,a+section_count))
        fs += [tuple(reversed(range(section_count))),tuple(range((len(shoe_rows)-1)*section_count,len(shoe_rows)*section_count))]
        upper=mesh('White and charcoal upper',vs,fs,trim,p);upper.data.materials.append(secondary)
        for poly in upper.data.polygons:
            coords=[vs[i] for i in poly.vertices]
            if sum(v[2] for v in coords)/len(coords)<.035:poly.material_index=1
        mesh('Rubber toe wrap',[(-.043,-.106,.187),(0,-.108,.197),(.043,-.106,.187),(.034,-.081,.186),(0,-.076,.195),(-.034,-.081,.186)],[(0,1,4,5),(1,2,3,4)],secondary,p)
        # White eye-stay panels flank a high black tongue.
        for s in [-1,1]:
            mesh('White eyestay',[(s*.020,.091,.018),(s*.038,.072,.020),(s*.052,.014,.105),(s*.025,.019,.123)],[(0,1,2,3)],trim,p)
            mesh('Angular side overlay',[(s*.054,.009,-.043),(s*.065,-.051,-.048),(s*.067,-.051,.108),(s*.058,-.015,.069),(s*.040,.037,-.005)],[(0,1,2,3,4)],secondary,p)
        mesh('Raised tongue',[(-.025,.096,.018),(.025,.096,.018),(.028,.019,.120),(-.028,.019,.120)],[(0,1,2,3)],secondary,p)
        for j in range(5):
            z=.030+j*.019;y=.087-j*.013
            tube('Crossed black lace',[(-.026,y,z),(.026,y-.005,z+.016)],.0034,ink,p)
            tube('Crossed black lace',[(.026,y,z),(-.026,y-.005,z+.016)],.0034,ink,p)
        tube('Heel loop',[(-.018,.018,-.063),(-.017,.058,-.072),(.017,.058,-.072),(.018,.018,-.063)],.004,secondary,p)
        sign=-1 if side=='L' else 1
        sock=section('Plain crew sock',[(.005,0,0,.036,.041),(.100,-sign*.006,-.018,.043,.047),(.218,-sign*.021,-.021,.058,.055)],trim,p,n=16,cap=False)
        for j in range(12):
            a=j*math.tau/12
            tube('Fine sock rib',[(math.sin(a)*.0435-sign*.006,.10,math.cos(a)*.0475-.018),(math.sin(a)*.0585-sign*.021,.217,math.cos(a)*.0555-.021)],.0005,sole,p,n=4)
        if style=='high':
            section('High ankle collar',[(.055,0,-.025,.051,.054),(.137,0,-.025,.043,.047)],secondary,p,n=12,cap=False)
            tube('High collar binding',[(math.sin(i*math.tau/12)*.044,.138,math.cos(i*math.tau/12)*.048-.025) for i in range(13)],.003,trim,p)
        elif style=='runner':
            for s in [-1,1]:
                mesh('Runner quarter stripe',[(s*.069,-.028,-.012),(s*.071,-.047,.025),(s*.069,-.039,.052),(s*.060,.008,.026)],[(0,1,2,3)],trim,p)
        # Reference sneakers have a broad, chunky footprint. Socks keep their
        # anatomical diameter; only the shoe below the ankle is widened.
        for obj in p.children:
            if obj.type=='MESH' and not obj.name.startswith(('Plain crew sock','Fine sock rib')):
                for v in obj.data.vertices:v.co.x*=1.40;v.co.y*=1.17
    export(r,d)

make_body()
make_head('head-scout','Scout')
make_head('head-spark','Spark',1.065)
for i,(id,label) in enumerate([('face-focus','Game face'),('face-grin','Big grin'),('face-wink','Good vibes')]):make_face(id,label,i)
for id,label,style in [('hair-sweep','Study sweep','sweep'),('hair-curls','Reverse sweep','curls'),('hair-pony','Swept pony','pony')]:make_hair(id,label,style)
for id,label,style in [('shirt-jersey','Study jersey','jersey'),('shirt-hoodie','Warm-up jersey','hoodie'),('shirt-track','Zip jersey','track')]:make_shirt(id,label,style)
make_bottom('bottom-court','Court shorts');make_bottom('bottom-training','Long court shorts',True)
for id,label,style in [('shoes-court','Study sneakers','court'),('shoes-runner','Court runner','runner'),('shoes-high','Court high','high')]:make_shoes(id,label,style)

exec(compile((ROOT/'assets/source/collection_02.py').read_text(), 'collection_02.py', 'exec'),globals())
exec(compile((ROOT/'assets/source/collection_03.py').read_text(), 'collection_03.py', 'exec'),globals())

# The existing authored accessories stay single-source. Their coordinate frame is
# uniformly mapped to the new head family once, never once per hairstyle.
exec(compile((ROOT/'assets/source/accessories.py').read_text(), 'reference-accessories', 'exec'),globals())
old_export=export
def export_accessory(root,record):
    for obj in root.children_recursive:
        if obj.type=='MESH':
            # Bake every local object transform before mapping the socket family.
            transform=obj.matrix_basis.copy()
            for v in obj.data.vertices:v.co=transform@v.co
            obj.matrix_basis=Matrix.Identity(4)
            for v in obj.data.vertices:v.co.x*=.76*(1.022 if record['slot']=='headwear' else 1);v.co.z*=.90;v.co.y*=.80
    if record.get('fit'):
        record['fit'].update(surface='face-v2',frame=FRAME,maxDistance=.085)
        if record['slot']=='facialHair':record['fit']['offset']=.0055
    for volume in record.get('hairFit',[]):
        if volume['mode']=='occlude':continue
        volume['center']=[v*s for v,s in zip(volume['center'],[.76,.90,.80])]
        volume['radii']=[v*s for v,s in zip(volume['radii'],[.76,.90,.80])]
        if volume['mode']=='contain':volume['radii'][0]*=1.022
        if 'transition' in volume:volume['transition']=[v*.9 for v in volume['transition']]
    old_export(root,record)
export=export_accessory
fitted_accessories()
# Round glasses reuse the tested frame/volume construction, in the new family.
r,d=asset('acc-glasses','Round frames','eyewear','One glasses asset: actual-face clearance, shaped temples and natural occlusion inside hair.');p=mount(r,d,'head')
for x in [-.096,.096]:tube_path('Round rim',[(x+math.cos(i*math.pi/8)*.073,.025+math.sin(i*math.pi/8)*.062,.267) for i in range(17)],.006,secondary,p,True)
tube_path('Bridge',[(-.023,.029,.267),(0,.038,.275),(.023,.029,.267)],.005,secondary,p)
for s in [-1,1]:tube_path('Temple',[(s*.166,.03,.267),(s*.22,.03,.247),(s*.248,.03,.135),(s*.245,.012,.02),(s*.24,-.036,-.075)],.005,secondary,p)
for piece in p.children:
    if piece.type=='MESH':piece['fitRole']='side' if piece.name.startswith('Temple') else 'front'
d['fit']=fit_spec('clearance',.016);d['fit'].update(projection='wrap',sideOffset=.003)
d['hairFit']=[{'targetSlot':'hair','mode':'occlude'}]
export(r,d);export=old_export
for id,label,style in [('acc-band','Captain band','band'),('acc-headphones','Off-duty audio','phones')]:
    r,d=asset(id,label,'accessory','Optional head accessory for the reference family.');p=mount(r,d,'head')
    if style=='band':rings('Headband',[(.122,.199,.181,-.015),(.153,.194,.176,-.015)],accent,p,24);d['excludesTags']=['tall-headwear']
    else:
        tube('Headphone band',[(math.cos(i*math.pi/16)*.252,.02+math.sin(i*math.pi/16)*.304,-.005) for i in range(17)],.016,secondary,p)
        for x in [-.249,.249]:ico('Ear cup',(x,-.050,-.005),(.03,.059,.045),accent,p,1)
    export(r,d)
for id,label,style in [('effect-orbit','Golden orbit','orbit'),('effect-spark','Team sparks','spark')]:
    r,d=asset(id,label,'effect','Bounded decorative geometry.');p=mount(r,d,'root');d['effect']=style
    if style=='orbit':tube('Orbit',[(math.cos(i*math.pi/16)*.43,.018,math.sin(i*math.pi/16)*.43) for i in range(33)],.005,accent,p)
    else:
        for i in range(5):a=i*2.4;ico('Spark',(math.sin(a)*.40,.22+(i%3)*.16,math.cos(a)*.35),(.019,.045,.019),accent,p,1)
    export(r,d)

slots=[{'id':s,'label':label,'required':required} for s,label,required in [('head','Head',True),('face','Face',True),('hair','Hair',False),('facialHair','Facial hair',False),('eyewear','Glasses',False),('headwear','Hats',False),('shirt','Tops',True),('bottom','Bottoms',True),('shoes','Footwear',True),('accessory','Accessories',False),('effect','Effects',False)]]
catalog={'version':1,'id':'zoomap-athletics','revision':'2.3.0','compatibleRecipeRevisions':['2.2.0'],'rig':{'id':'athlete-reference-v2','height':2.04,'sockets':sockets},'base':'body-athletic','slots':slots,'channels':channels,'assets':assets,'budgets':{'maxTriangles':14000,'maxBytes':1500000,'maxParts':12}}
catalog['bodyRegions']=['torso','upper-legs','feet']
catalog['bodyShape']={
    'weightProfile':[[0,0,0],[.80,0,0],[.99,.18,.24],[1.13,.34,.46],[1.30,.24,.32],[1.48,.06,.06],[1.61,0,0],[2.04,0,0]],
    'leanFactor':.55,
    'neck':{'socket':'head','bottom':-.36,'top':-.12,'radius':.10,'falloff':.035,'gain':.34},
    'limbs':[{'joints':['arm_'+side,'forearm_'+side,'hand_'+side],'radius':.095,'falloff':.055,'endMargin':.15,'profile':[[0,.22],[.40,.34],[.58,.24],[.78,.30],[1,0]]} for side in ['L','R']]+
            [{'joints':['leg_'+side,'shin_'+side,'foot_'+side],'radius':.11,'falloff':.045,'endMargin':.20,'profile':[[0,.28],[.30,.38],[.53,.18],[.70,.38],[1,0]]} for side in ['L','R']]}

(ROOT/'public/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')

# Live editable component/assembled review. Keep source exports in their own
# hidden collection; clone into the dedicated scene for reference comparisons.
excluded=bpy.data.collections.get('Reference unoutlined paint')
if excluded is None:excluded=bpy.data.collections.new('Reference unoutlined paint');scene.collection.children.link(excluded)
toon_materials={}
def toon(material):
    if material.name.startswith('face-ink'):
        if material in toon_materials:return toon_materials[material]
        m=material.copy();nodes=m.node_tree.nodes;links=m.node_tree.links
        bs=nodes.get('Principled BSDF');tex=next(n for n in nodes if n.type=='TEX_IMAGE')
        geo=nodes.new('ShaderNodeNewGeometry');transform=nodes.new('ShaderNodeVectorTransform');transform.vector_type='VECTOR';transform.convert_from='WORLD';transform.convert_to='OBJECT';links.new(geo.outputs['Incoming'],transform.inputs[0])
        separate=nodes.new('ShaderNodeSeparateXYZ');links.new(transform.outputs[0],separate.inputs[0]);absolute=nodes.new('ShaderNodeMath');absolute.operation='ABSOLUTE';links.new(separate.outputs['Y'],absolute.inputs[0])
        ramp=nodes.new('ShaderNodeMapRange');ramp.clamp=True;ramp.interpolation_type='SMOOTHSTEP';ramp.inputs['From Min'].default_value=.2;ramp.inputs['From Max'].default_value=.45;links.new(absolute.outputs[0],ramp.inputs[0])
        if material.get('expressionProjection')=='profile':ramp.inputs['To Min'].default_value=1;ramp.inputs['To Max'].default_value=0
        alpha=nodes.new('ShaderNodeMath');alpha.operation='MULTIPLY';links.new(tex.outputs['Alpha'],alpha.inputs[0]);links.new(ramp.outputs[0],alpha.inputs[1]);links.new(alpha.outputs[0],bs.inputs['Alpha'])
        toon_materials[material]=m;return m
    if material not in toon_materials:
        m=material.copy();m.name='Reference cel · '+material.name
        image=next((node.image for node in material.node_tree.nodes if node.type=='TEX_IMAGE'),None)
        nodes=m.node_tree.nodes;links=m.node_tree.links;nodes.clear()
        normal=nodes.new('ShaderNodeNewGeometry');dot=nodes.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=Vector((-.65,-.65,.75)).normalized();links.new(normal.outputs['Normal'],dot.inputs[0])
        remap=nodes.new('ShaderNodeMapRange');remap.inputs['From Min'].default_value=-1;remap.inputs['From Max'].default_value=1;links.new(dot.outputs['Value'],remap.inputs['Value'])
        ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='CONSTANT';ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
        for i,(pos,value) in enumerate([(0,.48),(.54,.78),(.77,1.0)]):
            e=ramp.color_ramp.elements[0] if i==0 else ramp.color_ramp.elements.new(pos);e.position=pos;e.color=(value,value,value,1)
        links.new(remap.outputs['Result'],ramp.inputs[0]);mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=material.diffuse_color;links.new(ramp.outputs[0],mix.inputs[2])
        if image:
            tex=nodes.new('ShaderNodeTexImage');tex.image=image
            paint=nodes.new('ShaderNodeMixRGB');paint.blend_type='MULTIPLY';paint.inputs[0].default_value=1;paint.inputs[1].default_value=material.diffuse_color;links.new(tex.outputs['Color'],paint.inputs[2]);links.new(paint.outputs[0],mix.inputs[1])
        shaded=mix.outputs[0]
        if material.get('vertexPigment'):
            pigment=nodes.new('ShaderNodeVertexColor');pigment.layer_name=material['vertexPigment']
            color_mix=nodes.new('ShaderNodeMixRGB');color_mix.blend_type='MULTIPLY';color_mix.inputs[0].default_value=1;links.new(shaded,color_mix.inputs[1]);links.new(pigment.outputs['Color'],color_mix.inputs[2]);shaded=color_mix.outputs[0]
        emission=nodes.new('ShaderNodeEmission');links.new(shaded,emission.inputs[0]);out=nodes.new('ShaderNodeOutputMaterial');links.new(emission.outputs[0],out.inputs[0]);toon_materials[material]=m
    return toon_materials[material]
ink_hull=bpy.data.materials.new('Reference silhouette ink');ink_hull.use_nodes=True
nodes=ink_hull.node_tree.nodes;links=ink_hull.node_tree.links;nodes.clear()
geo=nodes.new('ShaderNodeNewGeometry');front=nodes.new('ShaderNodeBsdfTransparent');back=nodes.new('ShaderNodeEmission');back.inputs[0].default_value=(.008,.010,.013,1)
mix=nodes.new('ShaderNodeMixShader');links.new(geo.outputs['Backfacing'],mix.inputs[0]);links.new(front.outputs[0],mix.inputs[1]);links.new(back.outputs[0],mix.inputs[2]);out=nodes.new('ShaderNodeOutputMaterial');links.new(mix.outputs[0],out.inputs[0])
def outline_copy(obj):
    hull=obj.copy();hull.data=obj.data.copy();hull.name='Ink · '+obj.name;scene.collection.objects.link(hull)
    bm=bmesh.new();bm.from_mesh(hull.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.normal_update()
    for v in bm.verts:v.co+=v.normal*.0035
    bm.to_mesh(hull.data);bm.free();hull.data.materials.clear();hull.data.materials.append(ink_hull)
    for poly in hull.data.polygons:poly.material_index=0
    hull.visible_shadow=False
def preview(name, ids, x=0, angle=0, grey=False, colors=None):
    root=empty(name);root.location.x=x;root.rotation_euler.z=angle
    covered={region for a in assets if a['id'] in ids for region in a.get('covers',[])}
    head_bvh=None
    for id in ids:
        record=next(a for a in assets if a['id']==id);source=next(o for o in roots if o.name==id or o.name.startswith(id+'.'))
        for mount_info in record['attachments']:
            mount_source=bpy.data.objects[mount_info['node']]
            for obj in mount_source.children_recursive:
                if obj.type!='MESH':continue
                copy=obj.copy();copy.data=obj.data.copy();copy.modifiers.clear();scene.collection.objects.link(copy);copy.parent=root;copy.hide_render=False
                if obj.get('avatarRegion') in covered:copy.hide_render=True;copy.hide_set(True)
                copy.matrix_basis=obj.matrix_basis.copy();copy.location+=Vector(co(positions[mount_info['socket']]))
                if id.startswith('head-'):
                    from mathutils.bvhtree import BVHTree
                    copy.data.calc_loop_triangles();head_bvh=BVHTree.FromPolygons([v.co for v in copy.data.vertices],[tuple(t.vertices) for t in copy.data.loop_triangles],all_triangles=True)
                if id.startswith('face-') and head_bvh:
                    for v in copy.data.vertices:
                        x,y,z=v.co.x,v.co.z,-v.co.y;rx,front,back=head_section(y);center=Vector(co((0,y,(front+back)*.5)))
                        direction=(v.co-center).normalized();hit=head_bvh.ray_cast(center+direction*2,-direction,4)[0]
                        if hit is not None:v.co=hit+direction*.0015
                if grey:
                    for i,material in enumerate(copy.data.materials):
                        if material.get('paletteChannel')=='skin':copy.data.materials[i]=grey_material
                for i,m in enumerate(copy.data.materials):
                    channel=m.get('paletteChannel')
                    if colors and channel in colors:
                        m=m.copy();color(m,colors[channel])
                    if copy.data.color_attributes:
                        m=m.copy();m['vertexPigment']=copy.data.color_attributes[0].name
                    copy.data.materials[i]=toon(m)
                if id.startswith('face-'):excluded.objects.link(copy)
    # Rasterized inverted hulls respect the expression texture's alpha. Freestyle
    # treats a transparent facial carrier as an occluder and drops jaw outlines.
    for obj in list(root.children):
        if obj.type=='MESH' and not obj.hide_render and not any(m.name.startswith('face-ink') for m in obj.data.materials):outline_copy(obj)
    return root
grey_material=mat('Reference study grey','#bcb9b5')
BASE=['body-athletic','head-scout','face-focus']
LOOK=BASE+['hair-sweep','shirt-jersey','bottom-court','shoes-court']
study_front=preview('Reference base · front',BASE,-1.60,grey=True)
study_side=preview('Reference base · side',BASE,-.83,-math.pi/2,grey=True)
look_front=preview('Reference outfit · front',LOOK,.02)
look_three=preview('Reference outfit · three quarter',LOOK,.86,-.45)
look_side=preview('Reference outfit · side',LOOK,1.66,-math.pi/2)

scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=2000;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Reference paper world');scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.72,.72,.72,1)
scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.8
scene.view_settings.view_transform='Standard'
floor=mesh('Reference paper floor',[(-8,0,-8),(8,0,-8),(8,0,8),(-8,0,8)],[(0,1,2,3)],mat('Paper','#f4f2ed'),None)
def area(name,pos,power,size):
    data=bpy.data.lights.new(name,'AREA');obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=co(pos);data.energy=power;data.shape='DISK';data.size=size;obj.rotation_euler=(Vector(co((0,1,0)))-obj.location).to_track_quat('-Z','Y').to_euler();return obj
area('Reference broad key',(-3,5,4),400,4);area('Reference soft fill',(3,3,2),120,5)
data=bpy.data.cameras.new('Reference comparison camera');camera=bpy.data.objects.new('Reference comparison camera',data);scene.collection.objects.link(camera)
camera.location=co((0,1.18,7));target=Vector(co((0,1.12,0)));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=4.4;scene.camera=camera
scene.render.use_freestyle=False;scene.render.line_thickness=1.35
if not bpy.context.view_layer.freestyle_settings.linesets:
    bpy.context.view_layer.freestyle_settings.linesets.new('Reference silhouettes')
line_style=bpy.context.view_layer.freestyle_settings.linesets[0].linestyle
line_style.color=(.018,.022,.026);line_style.thickness=1.4
lines=bpy.context.view_layer.freestyle_settings.linesets[0];lines.select_crease=False;lines.select_border=True;lines.select_silhouette=True
lines.select_by_collection=True;lines.collection=excluded;lines.collection_negation='EXCLUSIVE'
exec(compile((ROOT/'assets/source/collection_review.py').read_text(), 'collection_review.py', 'exec'),globals())
exec(compile((ROOT/'assets/source/hair_review.py').read_text(), 'hair_review.py', 'exec'),globals())
for obj in set(bpy.data.objects)-before:obj['zmap_reference']=True
for source in roots:
    source.hide_set(True)
    for obj in source.children_recursive:obj.hide_set(True)
for area_ui in bpy.context.screen.areas:
    if area_ui.type=='VIEW_3D':
        area_ui.spaces.active.region_3d.view_perspective='CAMERA';area_ui.spaces.active.shading.type='MATERIAL'
scene.render.filepath=str(ROOT/'docs/evidence/reference-v2/blender-iteration-01.png')
result={'scene':scene.name,'assets':len(assets),'triangles':{a['id']:a['triangles'] for a in assets},'render':scene.render.filepath}
