"""Original street-sport capsule on athlete-reference-v2.

Run: blender -b --python assets/source/studio_capsule.py
Reads existing reference authoring helpers without rebuilding any shipped part.
Writes ONLY public/capsule. Coordinates are metres, Y up, +Z forward.
"""
import bpy, json, math, sys, hashlib, struct
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
# The prefix defines the established rig and mesh/export helpers. Deliberately
# stop before its first asset build; existing runtime assets stay untouched.
ref=(ROOT/'assets/source/reference_kit.py').read_text()
exec(compile(ref.split('\nmake_body()\n')[0], 'reference_kit_helpers', 'exec'), globals())
CAPSULE=ROOT/'public/capsule';CAPSULE.mkdir(parents=True,exist_ok=True)
OUT=CAPSULE/'models';OUT.mkdir(parents=True,exist_ok=True)
assets=[];roots=[]
color(primary,'#f26443');color(secondary,'#262442');color(trim,'#fff0cc');color(accent,'#c5ee49');color(ink,'#15152b')


def bake(o):
    matrix=o.matrix_basis.copy()
    for v in o.data.vertices:v.co=matrix@v.co
    o.matrix_basis=Matrix.Identity(4)
    return o


def plate(name, points, material, depth=.006):
    """Closed angular appliqué, actual geometry rather than a texture decal."""
    n=len(points);vs=points+[(x,y,z-depth) for x,y,z in points]
    fs=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,material,None)


def front_sampler(o):
    vs=[v.co[:] for v in o.data.vertices];fs=[p.vertices[:] for p in o.data.polygons]
    tree=BVHTree.FromPolygons(vs,fs)
    def sample(x,y,margin=.006):
        hit=tree.ray_cast(Vector(co((x,y,.8))),Vector(co((0,0,-1))))[0]
        return -hit.y+margin if hit is not None else .135+margin
    return sample


def ribbon(name, points, width, material, sample, depth=.003):
    vs=[]
    for i,(x,y) in enumerate(points):
        p=Vector(points[max(0,i-1)]);q=Vector(points[min(len(points)-1,i+1)])
        d=(q-p).normalized();n=Vector((-d.y,d.x))*width/2
        for s in [-1,1]:
            xx=x+s*n.x; yy=y+s*n.y;vs.append((xx,yy,sample(xx,yy)+depth))
    fs=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(points)-1)]
    return mesh(name,vs,fs,material,None)


def pocket(name,x,y,z,w,h,material,flap):
    # A bevelled pocket wedge with a separate folded lip. Broad cuts remain
    # legible at portrait size; there are no floating thin tubes as fabric.
    p=plate(name,[(x-w*.5,y-h*.5,z),(x+w*.5,y-h*.5,z),(x+w*.5,y+h*.40,z+.005),(x+w*.32,y+h*.5,z+.006),(x-w*.5,y+h*.5,z+.006)],material,.023)
    f=plate(name+' folded lip',[(x-w*.53,y+h*.51,z+.014),(x+w*.52,y+h*.51,z+.014),(x+w*.40,y+h*.21,z+.025),(x-w*.49,y+h*.27,z+.025)],flap,.009)
    return [p,f]


def finish_part(root,rec,objects,kind):
    for obj in objects:bake(obj)
    bind(root,rec,objects,kind)
    # The old short-jersey field classifies far-out low vertices as forearm.
    # Explicit garment topology prevents a wide hem or inner long sleeve from
    # changing anatomical ownership merely because its silhouette is wider.
    for oi,obj in enumerate(objects):
        for v in obj.data.vertices:
            x,y=v.co.x,v.co.z; side='R' if x>=0 else 'L'; weights=None
            if rec['id']=='shirt-circuit' and oi==0:
                if v.index<128:
                    if y<1.31:
                        hip=1-ease(1.02,1.22,y);weights={'chest':1-hip,'hips':hip}
                elif (v.index-128)%36 == 7:
                    weights={'chest':1.0}
                elif (v.index-128)%36>=12:
                    fore=1-ease(1.13,1.245,y);wrist=1-ease(.945,1.005,y)
                    weights={'arm_'+side:1-fore,'forearm_'+side:fore*(1-wrist),'hand_'+side:fore*wrist}
            elif oi>0:
                hip=1-ease(1.02,1.22,y);weights={'chest':1-hip,'hips':hip}
            if weights is not None:
                for group in obj.vertex_groups:group.remove([v.index])
                for bone,w in weights.items():
                    if w>0:obj.vertex_groups[bone].add([v.index],w,'REPLACE')
    export(root,rec)
    rec['url']='models/'+rec['id']+'.glb'
    (CAPSULE/'parts.json').write_text(json.dumps(assets,indent=2)+'\n')
    print('CAPSULE_READY',rec['id'],rec['triangles'],rec['bytes'],flush=True)
    return root,rec


def make_jacket():
    r,d=asset('shirt-circuit','Switchback jacket','shirt','Original asymmetric cropped street-sport jacket: long articulated sleeves, angled storm tape, stand collar, deep pocket and panelled back.');d['covers']=['torso']
    o=torso_surface('Continuous V-neck jersey · Switchback shell',True)
    # Keep the established connected shoulder branch and its smooth skin field.
    vs=[(v.co.x,v.co.z,-v.co.y) for v in o.data.vertices[:128]]
    for i,(x,y,z) in enumerate(vs):
        row=i//16;a=(i%16)*math.tau/16
        x*=1.065;z*=1.16
        if row<2:y+=.033
        if row==5:y+=.065*max(0,1-abs(x)/.16)*max(0,math.cos(a))
        if row>=6:
            x*=1.07;z*=.90;y+=.060*max(0,math.cos(a))**1.6
        vs[i]=(x,y,z)
    fs=[tuple(p.vertices) for p in o.data.polygons if max(p.vertices)<128]
    base_material=[]
    for f in fs:
        mx=sum(vs[i][0] for i in f)/len(f);my=sum(vs[i][1] for i in f)/len(f)
        base_material.append(2 if my>1.49 else 1 if my<1.095 or mx<-.16 else 0)
    # Angular puff sleeves taper to bound cuffs. Six broad planes per ring.
    for sign,indices in [(1,[67,68,69,85,84,83]),(-1,[77,76,75,91,92,93])]:
        last=indices
        rows=[(1.427,.215,.082,.106),(1.32,.239,.100,.102),(1.21,.265,.066,.084),(1.10,.299,.060,.077),(1.017,.326,.049,.059),(.971,.338,.040,.047)]
        for step,(y,x,rx,rz) in enumerate(rows):
            ids=[]
            for ax,az in [(-.5,.866),(-1,0),(-.5,-.866),(.5,-.866),(1,0),(.5,.866)]:
                ids.append(len(vs));vs.append((sign*(x+ax*rx),y+ax*rx*.24,az*rz+.004))
            for j in range(6):
                fs.append((last[j],last[(j+1)%6],ids[(j+1)%6],ids[j]));base_material.append(1 if step==5 else 2 if sign<0 else 0)
            last=ids
    bpy.data.objects.remove(o,do_unlink=True)
    o=mesh('Continuous V-neck jersey · Switchback shell',vs,fs,primary,None);o.data.materials.append(secondary);o.data.materials.append(trim)
    for p,idx in zip(o.data.polygons,base_material):p.material_index=idx
    objects=[o];z=front_sampler(o)
    # Strong zipper slash across the chest; a lime pull makes it read as sports
    # tech, with a small cream interruption at the left shoulder.
    path=[(-.145,1.479),(-.085,1.411),(-.012,1.32),(.059,1.23),(.119,1.129)]
    objects.append(ribbon('Diagonal storm tape',path,.040,secondary,z))
    objects.append(ribbon('Cream zip teeth',path,.006,trim,z,.006))
    objects.append(plate('Neon zipper pull',[(-.08,1.42,z(-.08,1.42)+.018),(-.06,1.414,z(-.06,1.414)+.018),(-.073,1.381,z(-.073,1.381)+.018),(-.09,1.387,z(-.09,1.387)+.018)],accent))
    objects+=pocket('Left cargo pocket',-.09,1.187,z(-.09,1.187)+.022,.11,.105,secondary,trim)
    objects.append(plate('Signal chest badge',[(.069,1.40,z(.069,1.40)+.012),(.137,1.408,z(.137,1.408)+.012),(.137,1.370,z(.137,1.370)+.012),(.069,1.37,z(.069,1.37)+.012)],trim))
    objects.append(plate('Badge cut',[(.079,1.397,z(.079,1.397)+.019),(.105,1.399,z(.105,1.399)+.019),(.088,1.38,z(.088,1.38)+.019)],secondary))
    # Back yoke makes the reverse view designed as well as the front.
    objects.append(plate('Back chevron',[(-.149,1.435,-.112),(0,1.355,-.150),(.149,1.435,-.112),(.14,1.397,-.126),(0,1.316,-.151),(-.14,1.397,-.126)],secondary,-.007))
    return finish_part(r,d,objects,'shirt')


def make_vest():
    r,d=asset('shirt-relay','Courier varsity vest','shirt','Original boxy sleeveless varsity utility vest over a dark short-sleeve tee: split lapels, contrast shoulder yoke, twin folded pockets and raised back chevrons.');d['covers']=['torso']
    tee=torso_surface('Continuous V-neck jersey · Courier undershirt',True)
    for slot in tee.material_slots:slot.material=secondary
    # Existing tee supplies complete coverage where an open armhole would reveal
    # a body region intentionally hidden by the runtime's torso mask.
    rows=[(1.045,0,0,.222,.153),(1.09,0,0,.225,.158),(1.22,0,0,.197,.153),(1.35,0,0,.205,.147),(1.477,0,0,.223,.128),(1.523,0,-.013,.082,.087)]
    vest=section('Courier sleeveless outer vest',rows,primary,n=16,cap=False)
    # Remove only true side armhole quads above the armpit, leaving the tee.
    faces=[];mats=[]
    for p in vest.data.polygons:
        row=p.index//16;j=p.index%16
        if row==3 and j in [3,4,11,12]:continue
        faces.append(tuple(p.vertices));mats.append(2 if row==4 else 1 if row==0 else 0)
    points=[(v.co.x,v.co.z,-v.co.y)for v in vest.data.vertices]
    bpy.data.objects.remove(vest,do_unlink=True)
    vest=mesh('Courier sleeveless outer vest',points,faces,primary,None);vest.data.materials.append(secondary);vest.data.materials.append(trim)
    for p,mi in zip(vest.data.polygons,mats):p.material_index=mi
    objects=[tee,vest];z=front_sampler(vest)
    objects.append(ribbon('Center front closure',[(0,1.515),(0,1.4),(0,1.22),(0,1.08)],.024,secondary,z))
    for s in [-1,1]:
        # Large cropped lapels and pocket folds alter the silhouette and value
        # grouping rather than merely recoloring the source jersey.
        points=[(s*.019,1.498),(s*.103,1.489),(s*.087,1.388),(s*.021,1.429)]
        objects.append(plate('Folded lapel '+str(s),[(x,y,z(x,y)+.017)for x,y in points],trim,.012))
        objects+=pocket('Front utility pocket '+str(s),s*.104,1.184,z(s*.104,1.184)+.024,.129,.144,trim,primary)
        # Two small bright attachment tabs are sports/running loops, no weapons.
        objects.append(plate('Neon webbing tab '+str(s),[(s*.07,1.33,z(s*.07,1.33)+.014),(s*.096,1.33,z(s*.096,1.33)+.014),(s*.096,1.278,z(s*.096,1.278)+.014),(s*.07,1.278,z(s*.07,1.278)+.014)],accent))
    # Independent two-rib rear graphic is still geometry and recolors as trim.
    for y in [1.34,1.39]:
        objects.append(plate('Back varsity chevron',[(-.115,y+.037,-.133),(0,y,-.165),(.115,y+.037,-.133),(.11,y+.015,-.138),(0,y-.026,-.166),(-.11,y+.015,-.138)],trim,-.006))
    return finish_part(r,d,objects,'shirt')


def make_pack():
    r,d=asset('acc-pulse-pack','Pulse sling pack','accessory','Independent compact angular runner pack with wraparound shoulder straps, a raised chevron and a side signal tab. Uses the shared chest/hips skin and body-volume field.')
    objects=[]
    # Bevelled hard-fabric pod: front face sits 24 mm behind the broadest back
    # shell. The pack avoids arms and hips, and never covers a body region.
    objects.append(bake(box('Angular rear pod',(0,1.303,-.239),(.25,.318,.146),secondary,None,.031)))
    objects.append(bake(box('Raised rear panel',(0,1.312,-.323),(.20,.234,.045),primary,None,.023)))
    # Geometric rear identity. Reverse depth creates an outward-facing prism.
    objects.append(plate('Runner chevron',[(-.075,1.36,-.350),(0,1.32,-.355),(.075,1.36,-.350),(.073,1.329,-.350),(0,1.289,-.356),(-.073,1.329,-.350)],trim,-.009))
    objects.append(bake(box('Signal tab',(.137,1.30,-.255),(.033,.071,.028),accent,None,.006)))
    # Flat, wide straps rather than round cable harnesses. Polyline wrapping over
    # shoulders is split into short spans so body fields have enough samples.
    for s in [-1,1]:
        points=[(s*.084,1.44,-.182),(s*.123,1.483,-.115),(s*.143,1.509,-.045),(s*.149,1.498,.055),(s*.134,1.437,.144),(s*.139,1.335,.168),(s*.143,1.219,.165),(s*.138,1.146,.135),(s*.15,1.13,.053),(s*.149,1.157,-.106),(s*.101,1.205,-.180)]
        vs=[]
        for x,y,z in points:
            vs.extend([(x-.014,y,z),(x+.014,y,z)])
        fs=[(i*2,i*2+1,i*2+3,i*2+2)for i in range(len(points)-1)]
        objects.append(mesh('Wide running strap '+str(s),vs,fs,trim,None))
    # All parts share the rig, but explicit torso weighting prevents the strap's
    # outer vertices from being mistaken for arm fabric by the general field.
    for obj in objects:bake(obj)
    bind(r,d,objects,'shirt')
    for obj in objects:
        for v in obj.data.vertices:
            for g in obj.vertex_groups:g.remove([v.index])
            hip=1-ease(1.02,1.22,v.co.z)
            obj.vertex_groups['chest'].add([v.index],1-hip,'REPLACE')
            if hip:obj.vertex_groups['hips'].add([v.index],hip,'REPLACE')
    export(r,d);d['url']='models/'+d['id']+'.glb'
    (CAPSULE/'parts.json').write_text(json.dumps(assets,indent=2)+'\n')
    print('CAPSULE_READY',d['id'],d['triangles'],d['bytes'],flush=True)
    return r,d

jacket,jacket_rec=make_jacket()
vest,vest_rec=make_vest()
pack,pack_rec=make_pack()
(CAPSULE/'parts.json').write_text(json.dumps(assets,indent=2)+'\n')
# Preserve a compact editable authoring source alongside its actual preview.
for root in roots:
    root['studioCapsule']=True
    for child in root.children_recursive:child['studioCapsule']=True
bpy.ops.wm.save_as_mainfile(filepath=str(CAPSULE/'studio-capsule.blend'))

if '--export-only' in sys.argv: sys.exit(0)

# Actual geometry render. This review scene has no effect on exported assets.
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=False
scene.render.resolution_x=1500;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Capsule review world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.69,.78,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
scene.view_settings.view_transform='Standard'

# Assembly reference is imported for each preview without changing source GLBs.
def import_reference(filename):
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models'/filename))
    return list(set(bpy.data.objects)-before)

def preview_part(root,x,back=False):
    for o in [root]+list(root.children_recursive):o.hide_render=False
    root.location=co((x,0,0));root.rotation_euler.z=math.pi if back else 0
    refs=[]
    for fn in ['body-athletic.glb','head-scout.glb','hair-volt.glb','bottom-court.glb','shoes-court.glb','face-grin.glb']:
        imported=import_reference(fn);refs+=imported
        # Imported rigid GLBs use socket-local nodes; skin assets are root-space.
        socket='head' if fn.startswith(('head','hair','face')) else None
        for o in imported:
            if o.parent is None:
                o.location+=Vector(co(positions[socket])) if socket else Vector()
                holder=empty('Preview '+fn);o.parent=holder;holder.location=co((x,0,0));holder.rotation_euler.z=math.pi if back else 0
        for o in imported:
            if o.type=='MESH' and o.get('avatarRegion') in ['torso','upper-legs','feet']:o.hide_render=True
            if o.type=='MESH' and fn.startswith('face'):
                bm=bmesh.new();bm.from_mesh(o.data)
                remove=[f for f in bm.faces if o.data.materials[f.material_index].get('expressionProjection')=='profile']
                bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(o.data);bm.free()
    return refs
preview_part(jacket,-.55)
preview_part(vest,.55)
# Pack beauty is an independent reverse-view thumbnail at lower right later.
for o in [pack]+list(pack.children_recursive):o.hide_render=True
floor=box('Review stage',(0,-.025,0),(7,.05,5),mat('stage','#767891'),None,0)
def aim(obj,p):obj.rotation_euler=(Vector(co(p))-obj.location).to_track_quat('-Z','Y').to_euler()
for name,power,pos,size in [('Key',350,(-3,5,5),5),('Rim',420,(3,3,-3),4)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=co(pos);aim(obj,(0,1,0))
data=bpy.data.cameras.new('Capsule camera');camera=bpy.data.objects.new('Capsule camera',data);scene.collection.objects.link(camera)
camera.location=co((3.2,2.4,6.5));aim(camera,(0,1.12,0));camera.data.type='ORTHO';camera.data.ortho_scale=3.45;scene.camera=camera
scene.render.filepath=str(CAPSULE/'capsule-front.png');bpy.ops.render.render(write_still=True)
# Actual rear geometry view, with pack worn by jacket and visible cream straps.
for o in [pack]+list(pack.children_recursive):o.hide_render=False
pack.location=co((-.55,0,0))
camera.location=co((-3.0,2.1,-6.5));aim(camera,(0,1.12,0));scene.render.filepath=str(CAPSULE/'capsule-back.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(CAPSULE/'studio-capsule.blend'))
print('CAPSULE_COMPLETE',flush=True)
