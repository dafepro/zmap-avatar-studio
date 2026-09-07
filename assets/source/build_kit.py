"""Original modular kit; Blender 5.x. Factory background scene only.
MCP: execute_blender_code_for_cli opens a source, then executes this builder.
Runtime units: metres, Y up, +Z forward. Each export attachment is socket-local.
"""
import bpy, bmesh, math, json, hashlib
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'public/models'; OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def co(p):return (p[0],-p[2],p[1])
def mat(name,hex):
    values=[int(hex[i:i+2],16)/255 for i in (1,3,5)];values=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]
    m=bpy.data.materials.new(name);m.diffuse_color=(*values,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*values,1);b.inputs['Roughness'].default_value=.88;return m
skin=mat('skin','#c68b60'); primary=mat('primary','#782e43'); secondary=mat('secondary','#263b3c'); trim=mat('trim','#f4ead7'); hair=mat('hair','#312821'); ink=mat('ink','#24252a'); white=mat('white','#fff5e0'); iris=mat('iris','#554030'); sole=mat('sole','#e5e3d6'); accent=mat('accent','#d9a342')
channels=['skin','primary','secondary','trim','hair','iris','accent']
sockets=[{'id':'root','parent':None,'position':[0,0,0]},{'id':'hips','parent':'root','position':[0,.86,0]},{'id':'chest','parent':'hips','position':[0,.25,0]},{'id':'head','parent':'chest','position':[0,.55,0]}]
for sign,label in [(-1,'L'),(1,'R')]:
    sockets.extend([{'id':'arm_'+label,'parent':'chest','position':[sign*.272,.18,0]},{'id':'forearm_'+label,'parent':'arm_'+label,'position':[sign*.06,-.255,0]},{'id':'hand_'+label,'parent':'forearm_'+label,'position':[sign*.025,-.22,0]},{'id':'leg_'+label,'parent':'hips','position':[sign*.137,0,0]},{'id':'shin_'+label,'parent':'leg_'+label,'position':[0,-.34,0]},{'id':'foot_'+label,'parent':'shin_'+label,'position':[0,-.36,.01]}])
positions={}
for s in sockets:positions[s['id']]=Vector(s['position'])+(positions[s['parent']] if s['parent'] else Vector())
def empty(name,parent=None):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.parent=parent;return o
def finish(o,name,pos,size,material,parent):
    o.name=name;o.location=co(pos);o.scale=(size[0],size[2],size[1]);o.data.materials.append(material)
    bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=parent;return o
def box(name,pos,size,m,parent,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1);o=finish(bpy.context.object,name,pos,size,m,parent)
    if bevel:mod=o.modifiers.new('Crafted bevel','BEVEL');mod.width=bevel;mod.segments=1;bpy.ops.object.modifier_apply(modifier=mod.name)
    return o
def ico(name,pos,size,m,parent,sub=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub,radius=1);return finish(bpy.context.object,name,pos,size,m,parent)
def mesh(name,verts,faces,m,parent):
    data=bpy.data.meshes.new(name);data.from_pydata([co(v) for v in verts],[],faces);data.materials.append(m);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.parent=parent;return o
def rings(name,rs,m,parent,n=8):
    verts=[(math.sin(2*math.pi*i/n)*rx,y,math.cos(2*math.pi*i/n)*rz+z) for y,rx,rz,z in rs for i in range(n)]; faces=[]
    faces.append(tuple(reversed(range(n))))
    for row in range(len(rs)-1):
        for i in range(n):a=row*n+i;b=row*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    faces.append(tuple(range((len(rs)-1)*n,len(rs)*n)));return mesh(name,verts,faces,m,parent)
def ellipse(name,center,rx,ry,m,parent,n=16):
    x,y,z=center;return mesh(name,[(x+math.cos(i*math.pi*2/n)*rx,y+math.sin(i*math.pi*2/n)*ry,z) for i in range(n)],[tuple(range(n))],m,parent)
def line(name,points,width,m,parent):
    # Low-poly tube, oriented along a short facial feature or clothing seam.
    for a,b in zip(points,points[1:]):
        a,b=Vector(co(a)),Vector(co(b));d=b-a
        bpy.ops.mesh.primitive_cylinder_add(vertices=6,radius=width,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();o.data.materials.append(m);o.parent=parent
assets=[]; roots=[]
def asset(id,label,slot,description):
    root=empty(id); record={'id':id,'label':label,'slot':slot,'rig':'athlete-rigid-v1','description':description,'attachments':[],'channels':[],'tags':[]}; roots.append(root);return root,record
def mount(root,record,socket):
    o=empty(record['id']+'__'+socket,root);record['attachments'].append({'node':o.name,'socket':socket});return o
def export(root,record):
    for pivot in list(root.children):
        parts=[o for o in pivot.children if o.type=='MESH']
        if len(parts)>1:
            bpy.ops.object.select_all(action='DESELECT')
            for o in parts:o.select_set(True)
            bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();parts[0].name=record['id']+'_'+pivot.name+'_mesh'
    for obj in root.children_recursive:
        if obj.type=='MESH':
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
            if record['slot'] in ['head','body','shirt','bottom','shoes']:smooth(obj)
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for o in root.children_recursive:o.select_set(True)
    bpy.context.view_layer.objects.active=root;path=OUT/(record['id']+'.glb')
    # Blender requires globally unique material names; catalog palette names are
    # local to each exported asset. Canonicalize only for the export transaction.
    named=[]
    for obj in root.children_recursive:
        if obj.type!='MESH':continue
        for m in obj.data.materials:
            if m.get('paletteChannel') and not any(item[0]==m for item in named):
                channel=m['paletteChannel'];conflict=bpy.data.materials.get(channel)
                if conflict and conflict!=m:named.append((conflict,conflict.name));conflict.name='Temporary palette '+channel
                named.append((m,m.name));m.name=channel
    try:bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_extras=True,export_yup=True)
    finally:
        for material,original in reversed(named):material.name=original
    tris=0;used=set()
    for o in root.children_recursive:
        if o.type=='MESH':o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles);used.update(m.get('paletteChannel',m.name) for m in o.data.materials)
    record.update(url='models/'+path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),triangles=tris,channels=[c for c in channels if c in used]);assets.append(record)
    # Editable source shows whole assembled-space parts; exported local coordinates stay zero.
    for a in record['attachments']:bpy.data.objects[a['node']].location=co(positions[a['socket']])
    root.hide_render=True
    for child in root.children_recursive:child.hide_render=True
exec(compile((ROOT/'assets/source/sculpt.py').read_text(),str(ROOT/'assets/source/sculpt.py'),'exec'),globals())
sculpt_body()
for id,label,wide in [('head-scout','Scout',1),('head-spark','Spark',1.08)]:sculpt_head(id,label,wide)
for index,(id,label) in enumerate([('face-focus','Game face'),('face-grin','Big grin'),('face-wink','Good vibes')]):painted_face(id,label,index)
# Hair: bold silhouette pieces, not one round dome.
for id,label,style in [('hair-sweep','Side sweep','sweep'),('hair-curls','Cloud curls','curls'),('hair-pony','High pony','pony')]:
    r,d=asset(id,label,'hair','Interchangeable hair envelope with a clear athletic silhouette.');p=mount(r,d,'head')
    ico('Hair cap',(0,.147,-.042),(.251,.14,.22),hair,p,2)
    # Fitted nape shell: the crown continues down the back instead of exposing a bald band.
    back_rows=[(-.145,.198,.183),(-.065,.237,.207),(.095,.251,.211)]
    verts=[(math.sin(math.pi/2+i*math.pi/8)*rx,y,math.cos(math.pi/2+i*math.pi/8)*rz-.018) for y,rx,rz in back_rows for i in range(9)]
    faces=[(row*9+i,row*9+i+1,(row+1)*9+i+1,(row+1)*9+i) for row in range(2) for i in range(8)]
    mesh('Fitted nape',verts,faces,hair,p)
    if style=='curls':
        for i in range(26):
            a=i*2.4;rad=.20 if i<18 else .105;y=.09+(i%4)*.048
            if math.cos(a)*rad>.04:y+=.11  # Keep the front curls above the drawn brows.
            ico('Curl',(math.sin(a)*rad,y,math.cos(a)*rad-.03),(.085,.09,.083),hair,p,1)
    else:
        # Irregular broad lock wedges: each has its own direction, width and depth.
        locks=[(-.19,.17,.11,-.32,.14,.21,.12),(-.10,.22,.11,-.23,.16,.255,.14),(.015,.24,.11,-.10,.135,.262,.15),(.12,.22,.09,.02,.085,.255,.14),(.21,.17,.03,.245,.035,.205,.10)]
        if style=='pony':locks=[(-.16,.16,.13,-.26,.025,.18,.10),(-.06,.22,.12,-.20,.13,.25,.14),(.06,.235,.11,-.02,.115,.255,.15),(.17,.19,.06,.20,.005,.22,.11)]
        for x,y,z,tx,ty,tz,w in locks:
            mesh('Fringe facet',[(x-w*.6,y,z),(x+w*.6,y+.035,z),(x+w*.46,y+.075,z-.12),(x-w*.46,y+.025,z-.12),(tx,ty,tz)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],hair,p)
        crowns=[(-.21,.21,-.02,-.345,.265,-.075,.14),(-.12,.255,-.065,-.245,.37,-.06,.14),(.015,.27,-.07,-.07,.34,-.16,.16),(.12,.23,-.075,.20,.315,-.16,.14),(.19,.18,-.075,.29,.245,-.13,.12)]
        for x,y,z,tx,ty,tz,w in crowns:
            if style=='pony':ty=y+.035;tx=x+.025
            mesh('Crown facet',[(x-w*.5,y,z+.09),(x+w*.5,y+.018,z+.055),(x+w*.5,y,z-.085),(x-w*.5,y-.02,z-.07),(tx,ty,tz)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(3,2,1,0)],hair,p)
        for sign in [-1,1]:
            mesh('Sideburn',[(sign*.205,.12,.09),(sign*.252,.095,-.01),(sign*.247,-.065,.027),(sign*.218,-.02,.118)],[(0,1,2),(0,2,3)],hair,p)
        if style=='pony':
            ico('Hair tie',(0,.245,-.19),(.075,.054,.065),primary,p,2)
            tail=[(.01,.32,-.27,.13),(.065,.20,-.34,.12),(.12,.08,-.34,.10),(.17,-.045,-.31,.084),(.23,-.15,-.27,.055)]
            for x,y,z,scale in tail:ico('Ponytail',(x,y,z),(scale,.13,.09),hair,p,1)
    export(r,d)
for id,label,style in [('shirt-jersey','Club jersey','jersey'),('shirt-hoodie','Warm-up hoodie','hoodie'),('shirt-track','Track jacket','track')]:sculpt_top(id,label,style)
for id,label,long in [('bottom-court','Court shorts',False),('bottom-training','Training shorts',True)]:
    r,d=asset(id,label,'bottom','Hip waistband and separate leg panels retain stride articulation.');p=mount(r,d,'hips');rings('Waist',[(-.07,.231,.167,0),(.028,.222,.153,0)],secondary,p)
    for sign,side in [(-1,'L'),(1,'R')]:
        p=mount(r,d,'leg_'+side);end=-.29 if long else -.24;rings('Shorts',[(.028,.11,.147,0),(-.12,.127,.154,0),(end,.114,.146,0)],secondary,p)
        line('Side stripe',[(sign*.12,-.02,.047),(sign*.109,end+.03,.047)],.012,trim,p)
    export(r,d)
for id,label,style in [('shoes-court','Court classic','court'),('shoes-runner','Velocity runner','runner'),('shoes-high','High tops','high')]:
    r,d=asset(id,label,'shoes','Paired foot sockets, with socks, soles, toe panels and laces.')
    for side in ['L','R']:
        p=mount(r,d,'foot_'+side)
        rings('Sock',[(.00,.063,.07,0),(.17,.065,.071,0)],trim,p)
        for y in [.125,.153]:rings('Sock band',[(y,.067,.073,0),(y+.013,.067,.073,0)],primary,p)
        outline=[(-.07,-.075),(.07,-.075),(.094,-.02),(.094,.155),(.071,.228),(-.071,.228),(-.094,.155),(-.094,-.02)]
        vs=[(x*scale,y,z) for y,scale in [(-.157,.96),(-.119,1),(-.093,.97)] for x,z in outline]
        fs=[tuple(reversed(range(8))),tuple(range(16,24))]
        for row in range(2):
            for k in range(8):a=row*8+k;b=row*8+(k+1)%8;fs.append((a,b,b+8,a+8))
        mesh('Sculpted sole',vs,fs,sole,p)
        upper=[(x*.9,-.093,z*.95) for x,z in outline]+[(x*.73,.018 if z<.10 else -.005,z*.93) for x,z in outline]
        fs=[tuple(range(8,16))]
        for k in range(8):fs.append((k,(k+1)%8,(k+1)%8+8,k+8))
        mesh('Trainer panels',upper,fs,primary if style!='court' else secondary,p)
        mesh('Toe cap',[(-.082,-.042,.12),(.082,-.042,.12),(.065,-.04,.211),(-.065,-.04,.211),(-.078,-.003,.128),(.078,-.003,.128),(.057,-.014,.207),(-.057,-.014,.207)],[(0,1,5,4),(4,5,6,7),(1,2,6,5),(2,3,7,6),(3,0,4,7)],trim,p)
        box('Rubber toe grip',(0,-.15,.175),(.126,.024,.075),secondary,p,.008)
        box('Rubber heel grip',(0,-.15,-.035),(.128,.024,.075),secondary,p,.008)
        box('Tongue',(0,.01,.035),(.085,.025,.13),trim,p,.009)
        for side_sign in [-1,1]:
            mesh('Athletic side panel',[(side_sign*.087,-.025,.12),(side_sign*.09,-.052,.076),(side_sign*.08,-.053,-.027),(side_sign*.077,-.015,.032)],[(0,1,2,3) if side_sign==1 else (3,2,1,0)],trim,p)
        if style=='high':rings('High collar',[(-.05,.078,.085,-.026),(.084,.065,.074,-.026)],primary,p)
        if style=='runner':box('Heel tab',(0,.021,-.063),(.072,.056,.02),accent,p,.005)
        for i,z in enumerate([.005,.038,.07]):
            line('Laces',[(-.034,.026,z),(.034,.027,z+.018)],.0045,trim,p)
            line('Laces',[(.034,.026,z),(-.034,.027,z+.018)],.0045,trim,p)
    export(r,d)
for id,label,style in [('acc-band','Captain band','band'),('acc-glasses','Round frames','glasses'),('acc-headphones','Off-duty audio','phones')]:
    r,d=asset(id,label,'accessory','Optional head accessory, fitted across both head silhouettes.');p=mount(r,d,'head')
    if style=='band':
        rings('Headband',[(.13,.26,.226,-.02),(.172,.254,.22,-.02)],accent,p,16);d['excludesTags']=['tall-headwear']
    elif style=='glasses':
        for x in [-.096,.096]:
            points=[(x+math.cos(i*math.pi/8)*.073,.025+math.sin(i*math.pi/8)*.062,.241) for i in range(17)];line('Round rim',points,.009,secondary,p)
        line('Bridge',[(-.023,.029,.242),(.023,.029,.242)],.008,secondary,p)
        for sign in [-1,1]:line('Temple',[(sign*.166,.03,.24),(sign*.24,.03,.015)],.008,secondary,p)
    else:
        points=[(math.cos(i*math.pi/12)*.292,.016+math.sin(i*math.pi/12)*.292,-.005) for i in range(13)];line('Headphone band',points,.023,secondary,p)
        for x in [-.277,.277]:ico('Ear cup',(x,-.01,-.005),(.054,.097,.07),accent,p,2)
    export(r,d)
for id,label,style in [('effect-orbit','Golden orbit','orbit'),('effect-spark','Team sparks','spark')]:
    r,d=asset(id,label,'effect','Quiet bounded accent geometry; reduced motion keeps it still.');p=mount(r,d,'root');d['effect']=style
    if style=='orbit':
        points=[(math.cos(i*math.pi/24)*.52,.025,math.sin(i*math.pi/24)*.52) for i in range(49)];line('Orbit',points,.008,accent,p)
        for i in range(3):a=i*math.pi*2/3;ico('Orbit spark',(math.cos(a)*.52,.06,math.sin(a)*.52),(.035,.06,.035),accent,p,1)
    else:
        for i in range(5):a=i*2.4;ico('Floating spark',(math.sin(a)*.48,.22+(i%3)*.16,math.cos(a)*.4),(.022,.065,.022),accent,p,1)
    export(r,d)
slots=[{'id':s,'label':label,'required':required} for s,label,required in [('head','Head',True),('face','Face',True),('hair','Hair',False),('shirt','Tops',True),('bottom','Bottoms',True),('shoes','Footwear',True),('accessory','Accessories',False),('effect','Effects',False)]]
catalog={'version':1,'id':'zoomap-athletics','revision':'1.1.0','rig':{'id':'athlete-rigid-v1','height':2.04,'sockets':sockets},'base':'body-athletic','slots':slots,'channels':channels,'assets':assets,'budgets':{'maxTriangles':14000,'maxBytes':1500000,'maxParts':12}}
(ROOT/'public/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
# Assemble three representative looks into one editable turntable scene.
look_ids=[['body-athletic','head-scout','face-focus','hair-sweep','shirt-jersey','bottom-court','shoes-court'],['body-athletic','head-spark','face-grin','hair-pony','shirt-track','bottom-training','shoes-high','acc-band'],['body-athletic','head-scout','face-wink','hair-curls','shirt-hoodie','bottom-court','shoes-runner','acc-glasses']]
for index,ids in enumerate(look_ids):
    collection=bpy.data.collections.new('Look '+str(index+1));bpy.context.scene.collection.children.link(collection)
    look_root=empty('LookRoot'+str(index));look_root.location=co(((index-1)*1.05,0,0))
    preview_sockets={}
    for sock in sockets:
        node=empty('Preview_'+str(index)+'_'+sock['id'],preview_sockets[sock['parent']] if sock['parent'] else look_root);node.location=co(sock['position']);preview_sockets[sock['id']]=node
        if sock['id'].startswith('arm_'):node.rotation_euler.y=-.14 if sock['id'].endswith('R') else .14
    for id in ids:
        source=bpy.data.objects[id];record=next(a for a in assets if a['id']==id)
        def clone_tree(obj,parent=None):
            copy=obj.copy();copy.hide_render=False;collection.objects.link(copy);copy.parent=parent
            if obj.data and obj.type=='MESH':
                copy.data=obj.data.copy()
                for j,m in enumerate(copy.data.materials):
                    if index and m.get('paletteChannel',m.name) in ['skin','primary','hair']:
                        colors=[{'skin':'#e6b88c','primary':'#496d65','hair':'#c89144'},{'skin':'#855538','primary':'#d29339','hair':'#25262c'}]
                        channel=m.get('paletteChannel',m.name);colored=m.copy();colored.name=m.name+'_look'+str(index)
                        tint=mat('Preview tint',colors[index-1][channel]);colored.diffuse_color=tint.diffuse_color;colored.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=tint.diffuse_color
                        if colored.get('paletteChannel'):
                            mix=colored.node_tree.nodes.get('Palette multiply');mix.inputs[2].default_value=tint.diffuse_color
                        copy.data.materials[j]=colored
            for child in obj.children:clone_tree(child,copy)
            return copy
        for attachment in record['attachments']:
            clone=clone_tree(bpy.data.objects[attachment['node']],preview_sockets[attachment['socket']]);clone.location=(0,0,0)
            if record.get('skin'):
                copied_arm=next(o for o in clone.children_recursive if o.type=='ARMATURE')
                for obj in clone.children_recursive:
                    if obj.type=='MESH':
                        for mod in obj.modifiers:
                            if mod.type=='ARMATURE':mod.object=copied_arm
                for side,angle in [('L',.12),('R',-.12)]:
                    bone=copied_arm.pose.bones['arm_'+side];basis=bone.bone.matrix_local.to_quaternion();bone.rotation_mode='QUATERNION';bone.rotation_quaternion=basis.inverted()@Matrix.Rotation(angle,4,'Y').to_quaternion()@basis
for root in roots:root.hide_render=True
floor=mat('Studio paper','#ede9de');box('Studio floor',(0,-.055,0),(200,.08,200),floor,None,0)
world=bpy.data.worlds.new('Studio World');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.7,.73,.75,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;bpy.context.scene.world=world
for loc,energy,size in [((-3,-4,6),550,4),((4,-1,4),250,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3,-8,3));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=4.3
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.render.filepath=str(ROOT/'docs/evidence/blender-lineup.png');bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/avatar-kit.blend'));bpy.ops.render.render(write_still=True)
result={'assets':len(assets),'bytes':sum(a['bytes'] for a in assets),'triangles':sum(a['triangles'] for a in assets),'blender':bpy.app.version_string}
(ROOT/'docs/evidence/build.json').write_text(json.dumps(result,indent=2)+'\n')
