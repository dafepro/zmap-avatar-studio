"""Shared Blender mesh and self-contained GLB export helpers.
Executed by reference_kit.py inside its dedicated scene.
Runtime units: metres, Y up, +Z forward. Each export attachment is socket-local.
"""
import bpy, bmesh, math, json, hashlib, struct
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'public/models'; OUT.mkdir(parents=True,exist_ok=True)

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
    if record['slot']=='hair':
        for o in root.children_recursive:
            if o.type=='MESH' and not o.data.color_attributes:
                pigment=o.data.color_attributes.new(name='Hair pigment',type='FLOAT_COLOR',domain='CORNER')
                for c in pigment.data:c.color=(1,1,1,1)
    for pivot in list(root.children):
        parts=[o for o in pivot.children if o.type=='MESH']
        # Independent fitting regions must retain their semantic role after
        # mesh consolidation. Rims determine depth; temples wrap around sides.
        groups={}
        for part in parts:groups.setdefault(part.get('fitRole',''),[]).append(part)
        for role,group in groups.items():
            if len(group)>1 and record['slot']!='body':
                bpy.ops.object.select_all(action='DESELECT')
                for o in group:o.select_set(True)
                bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
                group[0].name=record['id']+'_'+pivot.name+('_'+role if role else '')+'_mesh'
                if role:group[0]['fitRole']=role
    for obj in root.children_recursive:
        if obj.type=='MESH':
            bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
            pass
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
    try:bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=False,export_extras=True,export_yup=True,export_vertex_color='ACTIVE')
    finally:
        for material,original in reversed(named):material.name=original
    # Blender emits duplicate sampler entries for a shared image on separate
    # projection materials. Canonicalize equal entries without touching geometry.
    binary=path.read_bytes();json_length=struct.unpack_from('<I',binary,12)[0]
    document=json.loads(binary[20:20+json_length]);unique=[];mapping={}
    for i,texture in enumerate(document.get('textures',[])):
        if texture not in unique:unique.append(texture)
        mapping[i]=unique.index(texture)
    if len(unique)<len(document.get('textures',[])):
        def rewrite(value):
            if isinstance(value,dict):
                for key,item in value.items():
                    if key.endswith('Texture') and isinstance(item,dict) and 'index' in item:item['index']=mapping[item['index']]
                    else:rewrite(item)
            elif isinstance(value,list):
                for item in value:rewrite(item)
        rewrite(document.get('materials',[]));document['textures']=unique
        chunk=json.dumps(document,separators=(',',':')).encode();chunk+=b' '*((-len(chunk))%4)
        tail=binary[20+json_length:];path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(chunk)+len(tail))+struct.pack('<II',len(chunk),0x4e4f534a)+chunk+tail)
    tris=0;used=set()
    for o in root.children_recursive:
        if o.type=='MESH':o.data.calc_loop_triangles();tris+=len(o.data.loop_triangles);used.update(m.get('paletteChannel',m.name) for m in o.data.materials)
    record.update(url='models/'+path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),triangles=tris,channels=[c for c in channels if c in used]);assets.append(record)
    # Editable source shows whole assembled-space parts; exported local coordinates stay zero.
    for a in record['attachments']:bpy.data.objects[a['node']].location=co(positions[a['socket']])
    root.hide_render=True
    for child in root.children_recursive:child.hide_render=True
