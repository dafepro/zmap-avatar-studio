"""KILN WORKSHOP: original five-piece collectible set, athlete-reference-v2.
Run: blender -b --python assets/source/kiln_workshop.py
Only writes new Kiln capsule assets and this set's editable source scene.
Authoring coordinates are metres, Y up, +Z forward. Concept is planning art;
all shipped forms below are actual independently editable Blender geometry.
"""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
ref=(ROOT/'assets/source/reference_kit.py').read_text()
exec(compile(ref.split('\nmake_body()\n')[0], 'reference_kit_helpers', 'exec'),globals())
OUT=ROOT/'public/capsule/models';OUT.mkdir(parents=True,exist_ok=True)
DESCRIPTORS=ROOT/'public/capsule/parts';DESCRIPTORS.mkdir(parents=True,exist_ok=True)
assets=[];roots=[]
PALETTE={'primary':'#bd684b','secondary':'#494640','trim':'#ecdab6','accent':'#88b3a1'}
for key,value in PALETTE.items():color(globals()[key],value)
color(hair,'#282d2a');color(skin,'#cd9570');color(ink,'#252c28')


def bake(obj):
    transform=obj.matrix_basis.copy()
    for v in obj.data.vertices:v.co=transform@v.co
    obj.matrix_basis=Matrix.Identity(4)
    return obj


def plate(name,points,material,depth=.008,parent=None):
    n=len(points);vs=points+[(x,y,z-depth)for x,y,z in points]
    fs=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
    return mesh(name,vs,fs,material,parent)


def patch(name,points,material,parent=None):
    return mesh(name,points,[tuple(range(len(points)))],material,parent)


def strip(name,points,width,material):
    vs=[]
    for x,y,z in points:vs.extend([(x-width/2,y,z),(x+width/2,y,z)])
    return mesh(name,vs,[(i*2,i*2+1,i*2+3,i*2+2)for i in range(len(points)-1)],material,None)


def solid_strip(name,points,width,material,depth=.012):
    vs=[]
    for i,p in enumerate(points):
        p=Vector(p);tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        normal=Vector((0,-tangent.z,tangent.y)).normalized()*depth/2
        for offset in [-normal,normal]:
            for sign in [-1,1]:vs.append(tuple(p+offset+Vector((sign*width/2,0,0))))
    fs=[(0,2,3,1),tuple(range(len(vs)-4,len(vs)))]
    for i in range(len(points)-1):
        a=i*4;b=a+4
        for j,k in [(0,1),(1,3),(3,2),(2,0)]:fs.append((a+j,b+j,b+k,a+k))
    return mesh(name,vs,fs,material,None)


def torso_weights(obj,start=1.02,end=1.22):
    for v in obj.data.vertices:
        for group in obj.vertex_groups:group.remove([v.index])
        hip=1-ease(start,end,v.co.z)
        for bone,w in [('chest',1-hip),('hips',hip)]:
            if w:obj.vertex_groups[bone].add([v.index],w,'REPLACE')


def anatomical_leg_shells():
    """Knee/calf-only authored shell on the unchanged anatomical skin field.

    The trouser crotch is independently patterned. Only the articulation region
    reuses the rig's knee topology, expanded into barrel planes and re-topologized
    before joining its exact top boundary to the trouser's leg openings.
    """
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/body-athletic.glb'))
    bpy.context.view_layer.update()
    imported=list(set(bpy.data.objects)-before);result=[]
    for original in imported:
        # glTF also creates an Icosphere bone-display helper; never author from it.
        if original.type!='MESH' or not original.name.startswith('Reference continuous anatomy · exposed'):continue
        obj=original.copy();obj.data=original.data.copy();obj.name='Articulated barrel knee shell';scene.collection.objects.link(obj)
        matrix=original.matrix_world.copy();obj.parent=None;obj.matrix_world=Matrix.Identity(4)
        for vertex in obj.data.vertices:vertex.co=matrix@vertex.co
        bm=bmesh.new();bm.from_mesh(obj.data)
        for y,normal in [(.410,(0,0,1)),(.779,(0,0,-1))]:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,y),plane_no=normal,clear_inner=True,clear_outer=False)
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if abs(v.co.x)>.3],context='VERTS');bm.to_mesh(obj.data);bm.free()
        for v in obj.data.vertices:
            x,y,z=v.co.x,v.co.z,-v.co.y;sign=1 if x>0 else -1
            cx=sign*(.11+(.99-y)*(.06/.43) if y>=.56 else .17+(.56-y)*(.055/.44))
            dx=x-cx;front=z-.006;radius=math.hypot(dx,front)
            xgain=.030+.020*ease(.70,.779,y)+.006*(1-ease(.40,.48,y))
            zgain=(.028 if front>0 else .018)+.024*ease(.70,.779,y)+.010*(1-ease(.40,.48,y))
            if radius>.005:x+=xgain*dx/radius;z+=zgain*front/radius
            top=ease(.71,.779,y)
            if top:
                angle=math.atan2((x-sign*.137)/.098,z/.139)
                x=x*(1-top)+(sign*.137+.098*math.sin(angle))*top
                z=z*(1-top)+.139*math.cos(angle)*top
            taper=1-ease(.410,.48,y)
            if taper:
                angle=math.atan2(x-cx,z-.006);cuff_cx=sign*(.197+(.434-y)*(.009/.075))
                x=x*(1-taper)+(cuff_cx+.082*math.sin(angle))*taper
                z=z*(1-taper)+(.006+.080*math.cos(angle))*taper
            v.co=co((x,y,z))
        # Decimate before constructing the interface, so its vertices are exact.
        obj.modifiers.clear();modifier=obj.modifiers.new('Bounded knee-shell retopology','DECIMATE');modifier.ratio=.72
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=modifier.name)
        saved=[]
        for v in obj.data.vertices:
            weights={obj.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>0}
            if not weights:
                side='R' if v.co.x>0 else 'L';knee=1-ease(.49,.64,v.co.z);weights={'leg_'+side:1-knee,'shin_'+side:knee}
            saved.append(weights)
        obj['anatomicalSkin']=json.dumps(saved);obj.vertex_groups.clear();obj.data.materials.clear();obj.data.materials.append(secondary)
        for poly in obj.data.polygons:poly.material_index=0;poly.use_smooth=False
        for key in list(obj.keys()):
            if key!='anatomicalSkin':del obj[key]
        result.append(obj)
    for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
    return result


def connect_leg_boundary(top,knee_shells,sign):
    """Triangulate the annulus between unequal ordered boundary rings."""
    bottom={};vertices={};edges={}
    for obj in knee_shells:
        keys=[]
        for v in obj.data.vertices:
            p=(v.co.x,v.co.z,-v.co.y);key=tuple(round(n,6)for n in p);vertices[key]=p;keys.append(key)
        for poly in obj.data.polygons:
            ids=list(poly.vertices)
            for a,b in zip(ids,ids[1:]+ids[:1]):
                edge=tuple(sorted([keys[a],keys[b]]));edges[edge]=edges.get(edge,0)+1
    for edge,count in edges.items():
        if count!=1:continue
        if all(vertices[key][1]>.70 and vertices[key][0]*sign>0 for key in edge):
            for key in edge:bottom[key]=vertices[key]
    bottom=list(bottom.values())
    if len(bottom)<5:raise ValueError(('Missing exact knee boundary',sign,len(bottom)))
    angle=lambda p:math.atan2((p[0]-sign*.137)/.098,p[2]/.139)
    top=sorted(top,key=angle);bottom=sorted(bottom,key=angle)
    av=[angle(p)for p in top];bv=[angle(p)for p in bottom];m=len(top);n=len(bottom);faces=[];i=j=0
    while i<m or j<n:
        an=av[(i+1)%m]+(math.tau if i+1>=m else 0) if i<m else math.inf
        bn=bv[(j+1)%n]+(math.tau if j+1>=n else 0) if j<n else math.inf
        if an<bn:faces.append((i%m,m+j%n,(i+1)%m));i+=1
        else:faces.append((i%m,m+j%n,m+(j+1)%n));j+=1
    return mesh('Continuous thigh-to-knee join '+str(sign),top+bottom,faces,secondary,None)


def finish_kiln(root,record,objects=None,kind=None,torso_only=()):
    if objects:
        for obj in objects:bake(obj)
        bind(root,record,objects,kind)
        for obj in objects:
            if 'anatomicalSkin' not in obj:continue
            for i,weights in enumerate(json.loads(obj['anatomicalSkin'])):
                for group in obj.vertex_groups:group.remove([i])
                for bone,w in weights.items():
                    if w>0:obj.vertex_groups[bone].add([i],w,'REPLACE')
            del obj['anatomicalSkin']
        if record['id']=='bottom-kiln-cuffed':
            for obj in objects:
                interface=obj.name.startswith('Continuous thigh-to-knee join')
                pattern=obj.name=='Connected barrel trouser pattern'
                if not (interface or pattern):continue
                for v in obj.data.vertices:
                    if pattern and v.co.z>.805 and v.co.z<.99:continue
                    for group in obj.vertex_groups:group.remove([v.index])
                    bone='hips' if pattern and v.co.z>=.99 else 'leg_'+('R' if v.co.x>0 else 'L')
                    obj.vertex_groups[bone].add([v.index],1,'REPLACE')
        for obj in torso_only:torso_weights(obj,1.10,1.28) if record['id']=='shirt-kiln-apron' else torso_weights(obj)
        if record['id']=='shirt-kiln-apron':
            obj=objects[0]
            for v in obj.data.vertices:
                if v.index>=128:
                    for group in obj.vertex_groups:group.remove([v.index])
                    arm=.88 if ((v.index-128)%18)//6==0 else 1
                    obj.vertex_groups['arm_'+('R' if v.co.x>0 else 'L')].add([v.index],arm,'REPLACE')
                    if arm<1:obj.vertex_groups['chest'].add([v.index],1-arm,'REPLACE')
                    continue
                if v.co.z>=1.31:continue
                for group in obj.vertex_groups:group.remove([v.index])
                hip=1-ease(1.10,1.28,v.co.z)
                for bone,w in [('chest',1-hip),('hips',hip)]:
                    if w:obj.vertex_groups[bone].add([v.index],w,'REPLACE')
    export(root,record)
    record['tags']+=['kiln-workshop']
    (DESCRIPTORS/(record['id']+'.json')).write_text(json.dumps(record,indent=2)+'\n')
    print('KILN_READY',record['id'],record['triangles'],record['bytes'],flush=True)
    return root,record


def folded_cap():
    r,d=asset('hat-kiln-folded','Kiln folded cap','headwear','Low work cap with a folded canvas band, twin split brim and celadon maker tile. One generic crown containment field fits every original hairstyle.')
    p=mount(r,d,'head')
    # Open-bottom continuous shell clears the complete containment ellipsoid.
    # Squared section gives a folded cloth work-cap silhouette, not a ball cap.
    rows=[(.135,.246,.254),(.168,.249,.255),(.296,.229,.236),(.337,.146,.166)]
    vs=[];n=16
    for y,rx,rz in rows:
        for i in range(n):
            a=i*math.tau/n
            x=math.copysign(abs(math.sin(a))**.72,math.sin(a))*rx
            z=-.018+math.copysign(abs(math.cos(a))**.72,math.cos(a))*rz
            vs.append((x,y,z))
    vs.append((-.025,.359,-.018));fs=[]
    for row in range(len(rows)-1):
        for j in range(n):a=row*n+j;b=row*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.extend(((len(rows)-1)*n+j,(len(rows)-1)*n+(j+1)%n,len(vs)-1)for j in range(n))
    shell=mesh('Continuous folded crown',vs,fs,primary,p);shell.data.materials.append(trim)
    for poly in shell.data.polygons:
        if 16<=poly.index<32 and poly.index%16 in [0,1,2,13,14,15]:poly.material_index=1
    # Fold seams and tabs stay outward of the crown; no internal collision wall.
    for s in [-1,1]:
        top=[(s*.011,.149,.239),(s*.181,.149,.224),(s*.187,.125,.337),(s*.014,.126,.367)]
        mesh('Thick split folded brim '+str(s),top+[(x,y-.012,z)for x,y,z in top],[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],primary,p)
    # Four broad cloth planes share a raised off-center diagonal fold ridge.
    front=[(-.206,.168,.244),(.202,.168,.244),(.190,.266,.228),(-.180,.281,.226),(.020,.221,.268)]
    folded=mesh('Raised diagonal canvas fold',front,[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],trim,p)
    pigment=folded.data.color_attributes.new(name='Canvas folded planes',type='FLOAT_COLOR',domain='CORNER')
    for poly,value in zip(folded.data.polygons,[.82,.94,1,.89]):
        for loop in poly.loop_indices:pigment.data[loop].color=(value,value,value,1)
    plate('Small folded side tuck',[(.190,.266,.235),(.213,.263,.211),(.229,.169,.213),(.202,.169,.249)],trim,.005,p)
    plate('Celadon ceramic cap tile',[(.164,.151,.262),(.225,.162,.254),(.222,.219,.247),(.171,.217,.253)],accent,.011,p)
    # The entry edge is above both field center and transition end.
    d['hairFit']=[{'targetSlot':'hair','mode':'contain','center':[0,.1125,-.018],'radii':[.209,.205,.216],'transition':[-.015,.09]}]
    return finish_kiln(r,d)


def apron_top():
    r,d=asset('shirt-kiln-apron','Kiln apron overshirt','shirt','Boxy short-sleeve maker overshirt with folded lapels, integrated trapezoid apron, broad divided pocket and crossed canvas back ties. The apron stays above the thigh split.')
    d['covers']=['torso']
    shell=torso_surface('Continuous V-neck jersey · Kiln overshirt',True)
    # Recut the connected topology into broader, straighter workwear planes.
    for v in shell.data.vertices:
        x,y,z=v.co.x,v.co.z,-v.co.y
        if v.index<128:
            x*=1.035;z*=1.14
            waist=1-ease(1.08,1.29,y);x*=1+.15*waist;z*=1+.03*waist
            # Preserve the qualified legacy waist height; a lifted side hem
            # enters the forearm body field and can fold into a broad waistband.
        else:
            row=((v.index-128)%18)//6;cx=[.221,.265,.273][row];sign=1 if x>0 else -1
            x=sign*(cx+(abs(x)-cx)*1.7);z*=1.32
        v.co=co((x,y,z))
    objects=[shell]
    # Apron remains torso-bound; no rigid panel crosses opposite moving thighs.
    rows=[(1.095,.204,.161),(1.17,.181,.169),(1.31,.137,.167),(1.414,.124,.137)]
    vs=[]
    for y,w,z in rows:
        for t in [-1,-.5,0,.5,1]:vs.append((w*t,y,z-.026*abs(t)**2))
    fs=[(row*5+j,row*5+j+1,(row+1)*5+j+1,(row+1)*5+j)for row in range(3)for j in range(4)]
    apron=mesh('Trapezoid canvas apron',vs,fs,trim,None);objects.append(apron)
    for s in [-1,1]:
        objects.append(plate('Folded notched collar '+str(s),[(s*.018,1.474,.130),(s*.064,1.514,.100),(s*.134,1.474,.108),(s*.101,1.396,.149),(s*.056,1.430,.154)],primary,.012))
        points=[(s*.096,1.400,.146),(s*.116,1.475,.137),(s*.142,1.506,.073),(s*.133,1.511,-.02),(s*.119,1.480,-.113),(s*.049,1.35,-.154),(-s*.121,1.17,-.151)]
        objects.append(strip('Canvas apron shoulder tie '+str(s),points,.038,trim))
        objects.append(bake(box('Graphite strap buckle '+str(s),(s*.101,1.409,.158),(.049,.042,.019),secondary,None,0)))
    # Actual closed pocket body and folded top lip, deliberately broad/asymmetric.
    objects.append(plate('Broad divided apron pocket',[(-.126,1.147,.176),(.122,1.147,.176),(.116,1.273,.186),(-.127,1.264,.185)],trim,.018))
    objects.append(plate('Pocket top folded lip',[(-.129,1.267,.192),(.118,1.276,.192),(.117,1.253,.193),(-.129,1.246,.193)],trim,.008))
    objects.append(strip('Pocket center stitch',[(-.012,1.148,.184),(-.012,1.250,.196)],.006,secondary))
    objects.append(plate('Glazed shard pocket mark',[(-.103,1.246,.200),(-.060,1.237,.201),(-.090,1.201,.200)],accent,.006))
    objects.append(bake(box('Cross-back maker clasp',(0,1.328,-.170),(.062,.056,.019),secondary,None,0)))
    return finish_kiln(r,d,objects,'shirt',objects[1:])


def barrel_trousers():
    r,d=asset('bottom-kiln-cuffed','Kiln cuffed trousers','bottom','Connected barrel work trousers with calf-height rolled cuffs and bevel-cut reinforced knees. Continuous hips/thigh/knee/shin weights follow actual leg articulation.')
    d['covers']=['upper-legs']
    vs=[];fs=[]
    # One connected crotch and waist; eight-segment leg openings continue down
    # to their own calf rings. This is a full trouser pattern, not scaled shorts.
    for front in [1,-1]:
        base=len(vs)
        for x,z in [(-.183,0),(-.154,.075),(-.108,.111),(-.054,.124),(0,.127),(.054,.124),(.108,.111),(.154,.075),(.183,0)]:vs.append((x*.95,1.047,z*.84*front))
        for x,z in [(-.202,0),(-.174,.092),(-.115,.131),(-.06,.132),(0,.128),(.06,.132),(.115,.131),(.174,.092),(.202,0)]:vs.append((x,.868 if x==0 else .953,z*front))
        for x,z in [(-.235,0),(-.203,.099),(-.140,.139),(-.069,.106),(-.039,0),(.039,0),(.069,.106),(.140,.139),(.203,.099),(.235,0)]:vs.append((x,.804,z*front))
        for j in range(8):fs.append(tuple(base+i for i in (j,j+1,j+10,j+9)))
        for j in range(4):fs.append(tuple(base+i for i in (9+j,10+j,19+j,18+j)))
        for j in range(4):fs.append(tuple(base+i for i in (13+j,14+j,24+j,23+j)))
    fs += [(13,41,50,22),(13,23,51,41)]
    trousers=mesh('Connected barrel trouser pattern',vs,fs,secondary,None)
    bm=bmesh.new();bm.from_mesh(trousers.data)
    for yy in [.99,1.035]:bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,yy),plane_no=(0,0,1),clear_inner=False,clear_outer=False)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(trousers.data);bm.free()
    knee_shells=anatomical_leg_shells();objects=[trousers]+knee_shells
    for sign,indices in [(-1,[18,19,20,21,22,49,48,47]),(1,[23,24,25,26,27,54,53,52])]:
        objects.append(connect_leg_boundary([vs[i]for i in indices],knee_shells,sign))
    surface_vs=[];surface_fs=[]
    for obj in objects:
        offset=len(surface_vs);surface_vs.extend(v.co[:]for v in obj.data.vertices);surface_fs.extend(tuple(offset+i for i in p.vertices)for p in obj.data.polygons)
    tree=BVHTree.FromPolygons(surface_vs,surface_fs)
    def depth(x,y):
        hit=tree.ray_cast(Vector(co((x,y,.8))),Vector(co((0,0,-1))))[0]
        if hit is None:raise ValueError(('Knee patch left trouser shell',x,y))
        return -hit.y+.012
    objects.append(section('Raised work waistband',[(1.029,0,0,.174,.108),(1.058,0,0,.169,.104)],secondary,n=16,cap=False))
    for s in [-1,1]:
        # Rolled ring remains open below; inner lip meets the actual leg opening.
        objects.append(section('Rolled canvas calf cuff '+str(s),[(.359,s*.206,.006,.077,.076),(.359,s*.206,.006,.087,.086),(.422,s*.198,.006,.094,.094),(.434,s*.197,.006,.089,.090)],trim,n=8,cap=False))
        patch_vs=[]
        for y,cx,w in [(.500,.184,.045),(.552,.175,.040),(.605,.168,.044),(.650,.160,.052),(.675,.158,.049)]:
            for t in [-1,-.5,0,.5,1]:
                x=s*(cx+t*w);patch_vs.append((x,y,depth(x,y)))
        panel=mesh('Conforming reinforced knee '+str(s),patch_vs,[(row*5+j,row*5+j+1,(row+1)*5+j+1,(row+1)*5+j)for row in range(4)for j in range(4)],trim,None);objects.append(panel)
        # Broad geometry edge crease lies on the same sampled shell.
        path=[(s*(cx-.031),y,depth(s*(cx-.031),y)+.002)for y,cx in [(.516,.183),(.55,.175),(.60,.168),(.645,.160)]]
        objects.append(strip('Knee stitch '+str(s),path,.005,secondary))
    return finish_kiln(r,d,objects,'leg')


def clogs():
    r,d=asset('shoes-kiln-clogs','Kiln strapped clogs','shoes','Broad closed-toe work clogs with wide canvas instep straps, low open-looking heels and graphite block soles. Calf socks use shin/foot blending; rigid shells stay below 0.26 m.')
    d['covers']=['feet'];objects=[]
    for s in [-1,1]:
        x=s*.225
        outline=[(-.070,-.071),(.070,-.071),(.093,.058),(.094,.164),(.063,.218),(-.063,.218),(-.094,.164),(-.093,.058)]
        vs=[]
        for y,scale in [(.008,.97),(.055,1),(.077,.98)]:vs.extend((x+px*scale,y,z)for px,z in outline)
        fs=[tuple(reversed(range(8))),tuple(range(16,24))]+[(k*8+j,k*8+(j+1)%8,(k+1)*8+(j+1)%8,(k+1)*8+j)for k in range(2)for j in range(8)]
        sole_mesh=mesh('Broad graphite clog sole '+str(s),vs,fs,secondary,None);objects.append(sole_mesh)
        # A lower heel than toe crown keeps a visible clog scoop behind the strap.
        rows=[(.065,x,.073,.088,.144),(.119,x,.095,.088,.124),(.172,x,.093,.072,.099),(.188,x,.075,.041,.070)]
        objects.append(section('Faceted closed clog toe '+str(s),rows,primary,n=8))
        # Articulated calf sock bridges the runtime feet mask to bare calf.
        sock=section('Articulated canvas ankle sock '+str(s),[(.117,x,.01,.037,.043),(.185,s*.220,.008,.039,.044),(.27,s*.214,-.008,.044,.043),(.355,s*.204,-.01,.061,.059)],trim,n=10,cap=False)
        sock['family']='footwear';sock['ankle_fabric']=True;objects.append(sock)
        strap_vs=[(x+px,y,z)for z in [.072,.136]for px,y in [(-.085,.143),(-.049,.204),(0,.221),(.049,.204),(.085,.143)]]
        strap_faces=[(i+5,i+6,i+1,i)for i in range(4)]+[(i+10,i+11,i+16,i+15)for i in range(4)]
        boundary=[0,1,2,3,4,9,8,7,6,5]
        strap_faces.extend((a,b,b+10,a+10)for a,b in zip(boundary,boundary[1:]+boundary[:1]))
        strap=mesh('Wide raised canvas instep strap '+str(s),strap_vs+[(px,py-.008,pz)for px,py,pz in strap_vs],strap_faces,trim,None);objects.append(strap)
        objects.append(bake(box('Square graphite clog buckle '+str(s),(x+s*.079,.155,.054),(.022,.050,.047),secondary,None,.004)))
        objects.append(plate('Celadon toe inlay '+str(s),[(x-.028,.141,.189),(x+.028,.141,.189),(x,.125,.212)],accent,.008))
        # Thick rear block and open notch are defined by the base volume, not ink.
        objects.append(bake(box('Heel support block '+str(s),(x,.035,-.048),(.138,.055,.057),secondary,None,.004)))
    return finish_kiln(r,d,objects,'footwear')


def maker_pack():
    r,d=asset('acc-kiln-maker','Kiln maker case','accessory','Angular slab-lid maker backpack with two short capped canvas rolls, broad cross straps and visible shoulder webbing. Compact chest-bound case clears the back and moving arms.')
    d['tags']=['back-mounted'];objects=[]
    objects.append(bake(box('Faceted slab maker case',(0,1.285,-.258),(.266,.319,.134),primary,None,.018)))
    objects.append(bake(box('Overhanging canvas slab lid',(0,1.439,-.277),(.287,.063,.165),trim,None,.014)))
    objects.append(plate('Folded slab back facet',[(-.123,1.396,-.332),(.12,1.396,-.332),(.025,1.326,-.350)],trim,-.009))
    objects.append(bake(box('Vertical case cross strap',(0,1.284,-.339),(.035,.310,.022),secondary,None,0)))
    objects.append(bake(box('Horizontal case cross strap',(0,1.28,-.341),(.276,.034,.022),secondary,None,0)))
    objects.append(bake(box('Celadon case clasp',(0,1.28,-.361),(.053,.050,.017),accent,None,.008)))
    # Two perpendicular capped roll forms behind the shoulders. Low and compact
    # enough to avoid hair, cap, and elbow reach rather than protruding poles.
    for z in [-.232,-.324]:
        objects.append(tube('Canvas maker roll', [(-.154,1.514,z),(.154,1.514,z)],.043,trim,n=8))
        for s in [-1,1]:objects.append(tube('Celadon closed roll cap',[(s*.153,1.514,z),(s*.172,1.514,z)],.045,accent,n=6))
        for x in [-.086,.086]:objects.append(tube('Graphite roll band',[(x-.012,1.514,z),(x+.012,1.514,z)],.046,secondary,n=6))
    for obj in objects:
        bake(obj)
        for v in obj.data.vertices:v.co.y-=.012
    for s in [-1,1]:
        points=[(s*.090,1.442,-.183),(s*.128,1.492,-.124),(s*.155,1.525,-.045),(s*.159,1.511,.063),(s*.145,1.443,.165),(s*.157,1.345,.190),(s*.166,1.222,.183),(s*.165,1.152,.148),(s*.175,1.133,.047),(s*.166,1.169,-.126),(s*.113,1.21,-.190)]
        objects.append(solid_strip('Broad maker shoulder webbing '+str(s),points,.043,secondary))
        objects.append(bake(box('Canvas strap keeper '+str(s),(s*.153,1.35,.202),(.046,.041,.012),trim,None,0)))
    return finish_kiln(r,d,objects,'shirt',objects)

folded_cap();apron_top();barrel_trousers();clogs();maker_pack()
for r in roots:
    r['collectibleSet']='kiln-workshop'
    r.hide_render=False
    for c in r.children_recursive:c.hide_render=False
# Packed original concept is visible in the authoring file's image datablock.
concept=bpy.data.images.load(str(ROOT/'docs/references/kiln/concept.jpg'),check_existing=True);concept.pack();concept.use_fake_user=True
scene['setId']='kiln-workshop';scene['conceptOnly']='Original planning reference; shipping geometry authored in kiln_workshop.py'
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/kiln-workshop.blend'),compress=True)
print('KILN_TOTAL',sum(a['triangles']for a in assets),sum(a['bytes']for a in assets),flush=True)
