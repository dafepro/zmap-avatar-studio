"""SUNLINE COURIER — original five-piece collectible capsule.

Deterministic authoring: blender -b --python assets/source/sunline_courier.py
Only writes this set's separate descriptors, GLBs and editable source scene.
Metres, Y up, +Z forward. Shared reference helpers supply rig/export contracts;
all five silhouettes and their panel topology are authored here, not reskins.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix
ROOT = Path(__file__).resolve().parents[2]
ref = (ROOT/'assets/source/reference_kit.py').read_text()
exec(compile(ref.split('\nmake_body()\n')[0], 'reference_kit_helpers', 'exec'), globals())
CAPSULE = ROOT/'public/capsule'
OUT = CAPSULE/'models'; OUT.mkdir(parents=True, exist_ok=True)
PARTS = CAPSULE/'parts'; PARTS.mkdir(parents=True, exist_ok=True)
assets=[]; roots=[]
for channel,value in [('primary','#e97552'),('secondary','#303643'),('trim','#f4e8cf'),('accent','#d4e951')]:
    color(globals()[channel],value)


def bake(obj):
    matrix=obj.matrix_basis.copy()
    for vertex in obj.data.vertices: vertex.co=matrix@vertex.co
    obj.matrix_basis=Matrix.Identity(4)
    return obj


def prism(name, points, material, depth=.007):
    n=len(points)
    vertices=points+[(x,y,z-depth) for x,y,z in points]
    faces=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vertices,faces,material,None)


def weight_object(obj, field):
    for vertex in obj.data.vertices:
        for group in obj.vertex_groups: group.remove([vertex.index])
        weights=field(vertex)
        weights={bone:value for bone,value in weights.items() if value>1e-6}
        total=sum(weights.values())
        for bone,value in weights.items(): obj.vertex_groups[bone].add([vertex.index],value/total,'REPLACE')


def torso_weight(vertex):
    hip=1-ease(1.02,1.22,vertex.co.z)
    return {'chest':1-hip,'hips':hip}


def finish_part(root,record,objects,kind,overrides=()):
    for obj in objects:bake(obj)
    bind(root,record,objects,kind)
    for obj,field in overrides:weight_object(obj,field)
    export(root,record)
    record['tags']=[*record.get('tags',[]),'sunline-courier']
    (PARTS/(record['id']+'.json')).write_text(json.dumps(record,indent=2)+'\n')
    print('SUNLINE_READY',record['id'],record['triangles'],record['bytes'],flush=True)
    return root,record


def make_visor():
    root,record=asset('hat-sunline-visor','Sunline open visor','headwear','Open-crown angular courier visor with a faceted split brim, wide cream band and citron side fastener. Original hair is naturally depth-occluded, never cut or substituted.')
    record['hairFit']=[{'targetSlot':'hair','mode':'occlude'}]
    parent=mount(root,record,'head')
    count=20;vertices=[]
    # Full annular wearing band clears both authored heads. No crown volume.
    for y,rx,rz in [(.096,.204,.220),(.146,.200,.216),(.146,.191,.207),(.096,.195,.211)]:
        for i in range(count):
            a=i*math.tau/count
            cosine=math.cos(a)
            z=-.019+rz*(cosine**.48 if cosine>0 else cosine)
            vertices.append((math.sin(a)*rx,y,z))
    faces=[]
    for ring in range(4):
        for i in range(count):faces.append((ring*count+i,ring*count+(i+1)%count,((ring+1)%4)*count+(i+1)%count,((ring+1)%4)*count+i))
    band=mesh('Open crown folded wearing band',vertices,faces,trim,parent);band.data.materials.append(primary);band.data.materials.append(secondary)
    for face in band.data.polygons:
        if face.index//count==2:face.material_index=2
        elif face.index%count in range(4,16):face.material_index=1
    # Two swept front pieces leave a deliberate central step, unlike a flat cap.
    for sign in [-1,1]:
        shape=[(sign*.006,.099,.204),(sign*.085,.104,.193),(sign*.163,.106,.143),(sign*.203,.068,.307),(sign*.055,.075,.337),(sign*.006,.089,.317)]
        brim=prism('Split swept visor blade '+str(sign),shape,trim,.009);brim.parent=parent
        edge=prism('Coral visor wing '+str(sign),[(sign*.146,.108,.168),(sign*.170,.104,.142),(sign*.204,.071,.306),(sign*.175,.073,.312)],primary,.006);edge.parent=parent
    buckle=bake(box('Citron visor lock',(.207,.122,.055),(.022,.046,.036),accent,parent,.004))
    export(root,record);record['tags']=['sunline-courier']
    (PARTS/(record['id']+'.json')).write_text(json.dumps(record,indent=2)+'\n')
    print('SUNLINE_READY',record['id'],record['triangles'],record['bytes'],flush=True)
    return root,record


def make_jacket():
    root,record=asset('shirt-sunline-courier','Sunline stepped jacket','shirt','Stepped asymmetric cropped courier jacket with sculpted long sleeves, folded storm lapels and complete charcoal underlayer; chest-to-arm and elbow blends use the unchanged reference skeleton.')
    record['covers']=['torso']
    objects=[];overrides=[]
    # The complete underlayer closes every torso-mask opening beneath the crop.
    under=section('Complete charcoal fitted undershirt',[(1.005,0,0,.202,.131),(1.075,0,0,.190,.129),(1.19,0,0,.177,.131),(1.31,0,0,.184,.128),(1.405,0,0,.186,.112),(1.50,0,-.005,.108,.094),(1.557,0,-.012,.065,.063)],secondary,n=16,cap=False)
    objects.append(under);overrides.append((under,torso_weight))
    # Connected shoulder branches on a completely redrawn cropped-shell profile.
    rows=[(1.155,.217,.150),(1.207,.210,.151),(1.294,.201,.146),(1.358,.214,.138),(1.409,.221,.126),(1.506,.225,.112),(1.548,.091,.088),(1.590,.074,.079)]
    vertices=[];faces=[];materials=[]
    for row,(y,rx,rz) in enumerate(rows):
        for j in range(16):
            a=j*math.tau/16;x=math.sin(a)*rx;z=math.cos(a)*rz
            # A high left hem and low right flap make a visibly stepped crop.
            yy=y+(max(0,-x)*.28 if row==0 else 0)
            if row>=6:z-=.010
            vertices.append((x,yy,z))
    for row in range(7):
        for j in range(16):
            if row==4 and j in [3,4,11,12]:continue
            # Split center-front jacket opening reveals a complete fabric layer.
            if j in [0,15] and row<6:continue
            a=row*16+j;b=row*16+(j+1)%16
            faces.append((a,b,b+16,a+16))
            materials.append(2 if j>=8 else 0)
    for sign,indices in [(1,[67,68,69,85,84,83]),(-1,[77,76,75,91,92,93])]:
        last=indices
        sleeve_rows=[(1.440,.229,.083,.105),(1.343,.254,.092,.098),(1.254,.276,.073,.086),(1.180,.287,.067,.078),(1.09,.307,.073,.081),(1.022,.328,.061,.063),(.975,.340,.042,.047),(.962,.342,.041,.046)]
        for step,(y,x,rx,rz) in enumerate(sleeve_rows):
            ids=[]
            for ax,az in [(-.5,.866),(-1,0),(-.5,-.866),(.5,-.866),(1,0),(.5,.866)]:
                ids.append(len(vertices));vertices.append((sign*(x+ax*rx),y+ax*rx*.24,.005+az*rz))
            for j in range(6):
                faces.append((last[j],last[(j+1)%6],ids[(j+1)%6],ids[j]))
                materials.append(1 if step in [3,4,6] and j in [1,2,3,4] else 2 if sign<0 or step==7 else 0)
            last=ids
    shell=mesh('Continuous V-neck jersey · Sunline sculpted shell',vertices,faces,primary,None)
    shell.data.materials.append(secondary);shell.data.materials.append(trim)
    for face,mi in zip(shell.data.polygons,materials):face.material_index=mi
    objects.append(shell)
    # Preserve the shared shoulder diffusion, then explicitly classify each long
    # sleeve beyond its first ring. No low inside sleeve vertex becomes torso.
    def shell_weights(vertex):
        i=vertex.index;y=vertex.co.z;sign='R' if vertex.co.x>=0 else 'L'
        if i<128:return torso_weight(vertex) if y<1.36 else {shell.vertex_groups[g.group].name:g.weight for g in vertex.groups}
        step=(i-128)%48//6
        if step==0:return {shell.vertex_groups[g.group].name:g.weight for g in vertex.groups}
        fore=1-ease(1.13,1.255,y);wrist=1-ease(.945,.99,y)
        return {'arm_'+sign:1-fore,'forearm_'+sign:fore*(1-wrist),'hand_'+sign:fore*wrist}
    # The custom field is applied below before clearing its existing groups.
    objects.extend([
        prism('Long cream folded storm lapel',[(-.08,1.545,.085),(-.128,1.492,.113),(-.077,1.343,.164),(-.020,1.400,.188),(-.050,1.489,.140)],trim,.014),
        prism('Stepped coral chest flap',[(.045,1.488,.145),(.135,1.402,.143),(.084,1.348,.170),(-.047,1.406,.198)],primary,.016),
        prism('Cream lower offset hem blade',[(.047,1.346,.163),(.093,1.322,.164),(.158,1.165,.135),(.111,1.134,.155)],trim,.012),
        prism('Citron offset zipper pull',[(.025,1.379,.202),(.044,1.375,.203),(.078,1.257,.188),(.059,1.258,.189)],accent,.004),
        prism('Back cream envelope yoke',[(-.154,1.452,-.108),(0,1.471,-.130),(.154,1.452,-.108),(.035,1.306,-.156),(-.14,1.374,-.128)],trim,-.009),
        prism('Small back citron tab',[(-.020,1.293,-.158),(.020,1.293,-.158),(.020,1.252,-.160),(-.020,1.252,-.160)],accent,-.006)
    ])
    for obj in objects[2:]:overrides.append((obj,torso_weight))
    for obj in objects:bake(obj)
    bind(root,record,objects,'shirt')
    saved=[shell_weights(vertex) for vertex in shell.data.vertices]
    weight_object(shell,lambda vertex:saved[vertex.index])
    for obj,field in overrides:weight_object(obj,field)
    export(root,record);record['tags']=['sunline-courier']
    (PARTS/(record['id']+'.json')).write_text(json.dumps(record,indent=2)+'\n')
    print('SUNLINE_READY',record['id'],record['triangles'],record['bytes'],flush=True)
    return root,record


def make_pants():
    root,record=asset('bottom-sunline-cargo','Sunline tapered cargo','bottom','Connected tapered ankle cargo trousers with broad folded thigh pockets, angled knee panels and cuff openings above the shared shoe envelope. Full leg/shin skinning, no shorts-only weights.')
    record['covers']=['upper-legs'];objects=[]
    vertices=[];faces=[]
    # A welded pelvis with two independently articulated eight-sided openings.
    for front in [1,-1]:
        base=len(vertices)
        for x,z in [(-.174,0),(-.146,.067),(-.104,.096),(-.052,.107),(0,.107),(.052,.107),(.104,.096),(.146,.067),(.174,0)]:vertices.append((x,1.047,z*front))
        for x,z in [(-.187,0),(-.156,.085),(-.106,.123),(-.056,.105),(0,.074),(.056,.105),(.106,.123),(.156,.085),(.187,0)]:vertices.append((x,.916 if x==0 else .948,z*front))
        for x,z in [(-.235,0),(-.206,.088),(-.146,.112),(-.082,.084),(-.044,0),(.044,0),(.082,.084),(.146,.112),(.206,.088),(.235,0)]:vertices.append((x,.791,z*front))
        for j in range(8):faces.append(tuple(base+i for i in (j,j+1,j+10,j+9)))
        for j in range(4):faces.append(tuple(base+i for i in (9+j,10+j,19+j,18+j)))
        for j in range(4):faces.append(tuple(base+i for i in (13+j,14+j,24+j,23+j)))
    faces.extend([(13,41,50,22),(13,23,51,41)])
    # Order starts at outer side, travels through front, inside and back.
    for sign,opening in [(-1,[18,19,20,21,22,49,48,47]),(1,[27,26,25,24,23,52,53,54])]:
        last=opening
        for y,cx,rx,rz,cz in [(.700,.153,.091,.096,.003),(.596,.169,.082,.091,.011),(.565,.174,.086,.103,.012),(.515,.182,.082,.087,.008),(.413,.198,.086,.084,-.003),(.323,.210,.066,.066,-.005),(.286,.215,.057,.058,-.004)]:
            ids=[]
            for j in range(8):
                angle=j*math.tau/8
                ids.append(len(vertices));vertices.append((sign*(cx+rx*math.cos(angle)),y,cz+rz*math.sin(angle)))
            for j in range(8):faces.append((last[j],last[(j+1)%8],ids[(j+1)%8],ids[j]))
            last=ids
    pants=mesh('Welded pelvis and tapered articulated cargo legs',vertices,faces,secondary,None)
    bm=bmesh.new();bm.from_mesh(pants.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(pants.data);bm.free();objects.append(pants)
    pants.data.materials.append(primary);pants.data.materials.append(trim)
    for face in pants.data.polygons:
        centre=face.center
        if .49<centre.z<.61 and abs(centre.x)>.19 and centre.y<0:face.material_index=2
    objects.append(section('Flat tailored waistband',[(1.029,0,0,.174,.108),(1.058,0,0,.169,.104)],secondary,n=16,cap=False))
    for sign in [-1,1]:
        objects.append(section('Cream ankle cuff '+str(sign),[(.286,sign*.215,-.004,.059,.060),(.318,sign*.211,-.005,.068,.068)],trim,n=8,cap=False))
        # Thigh pockets are broad closed sculpted wedges with a real folded lip.
        x=sign*.153
        objects.append(prism('Broad charcoal cargo gusset '+str(sign),[(x-.069,.749,.136),(x+.069,.758,.136),(x+.066,.924,.143),(x-.068,.916,.143)],primary,.083))
        objects.append(prism('Folded cream envelope pocket '+str(sign),[(x-.073,.921,.153),(x+.073,.928,.153),(x+.043,.874,.174),(x-.058,.859,.174)],trim,.012))
        objects.append(prism('Citron pocket release '+str(sign),[(x-.010,.884,.181),(x+.010,.886,.181),(x+.008,.825,.159),(x-.012,.822,.159)],accent,.006))
        objects.append(prism('Angular ivory shin flash '+str(sign),[(sign*.178,.509,.098),(sign*.231,.453,.097),(sign*.241,.351,.080),(sign*.198,.401,.098)],trim,.006))
        objects.append(prism('Coral hip cut '+str(sign),[(sign*.130,1.035,.076),(sign*.160,1.011,.067),(sign*.173,.960,.063),(sign*.154,.975,.088)],primary,.006))
    return finish_part(root,record,objects,'leg')


def make_shoes():
    root,record=asset('shoes-sunline-track','Sunline split track trainers','shoes','Low aerodynamic track trainers with a notched split-front shell, thick faceted midsole, angled coral quarters and citron heel tab. Rigid foot collars remain below 0.26 m.')
    record['covers']=['feet'];objects=[]
    outline=[(0,.217),(.017,.235),(.061,.224),(.091,.176),(.092,.074),(.075,-.060),(.043,-.090),(-.043,-.090),(-.075,-.060),(-.092,.074),(-.091,.176),(-.061,.224),(-.017,.235)]
    count=len(outline)
    for sign in [-1,1]:
        side='L' if sign<0 else 'R';origin=positions['foot_'+side]
        vertices=[];faces=[]
        for y,scale in [(-.119,.96),(-.104,1.04),(-.068,1.01),(-.054,.94)]:
            for x,z in outline:vertices.append((x+origin.x,y+origin.y,z+origin.z))
        faces=[tuple(reversed(range(count))),tuple(range(3*count,4*count))]
        for row in range(3):
            for j in range(count):a=row*count+j;b=row*count+(j+1)%count;faces.append((a,b,b+count,a+count))
        sole_obj=mesh('Faceted split-front runner midsole '+side,vertices,faces,trim,None);sole_obj.data.materials.append(secondary)
        for face in sole_obj.data.polygons:
            if face.index==0 or 2<=face.index<2+count:face.material_index=1
        objects.append(sole_obj)
        # Sculpted lengthwise rings lift the heel/instep, flatten the long toe,
        # and omit dorsal heel quads for a genuine open low ankle collar.
        vertices=[];faces=[];n=8
        for z,width,top in [(-.082,.042,.021),(-.056,.069,.105),(-.009,.079,.100),(.063,.087,.057),(.150,.085,.011),(.211,.060,-.011),(.230,.016,-.028)]:
            for j in range(n):
                a=j*math.tau/n
                vertices.append((origin.x+width*math.sin(a),origin.y+(-.054+top)*.5+math.cos(a)*(top+.054)*.5,origin.z+z))
        for row in range(6):
            for j in range(n):
                if row in [1] and j in [0,7]:continue
                a=row*n+j;b=row*n+(j+1)%n;faces.append((a,b,b+n,a+n))
        faces.extend([tuple(reversed(range(n))),tuple(range(6*n,7*n))])
        upper=mesh('Low sculpted runner shell '+side,vertices,faces,trim,None);upper.data.materials.append(secondary)
        for face in upper.data.polygons:
            coords=[vertices[i] for i in face.vertices]
            if sum(v[2] for v in coords)/len(coords)<origin.z+.033:face.material_index=1
        objects.append(upper)
        def shifted(points):return [(x+origin.x,y+origin.y,z+origin.z)for x,y,z in points]
        for s in [-1,1]:
            objects.append(prism('Coral aerodynamic quarter '+side+str(s),shifted([(s*.070,.079,-.032),(s*.087,-.026,.045),(s*.083,-.047,.156),(s*.061,-.020,.199),(s*.059,.006,.100),(s*.045,.071,.010)]),primary,.004))
            objects.append(prism('Citron midsole heel wedge '+side+str(s),shifted([(s*.082,-.061,-.025),(s*.092,-.078,.030),(s*.09,-.096,.026),(s*.077,-.083,-.049)]),accent,.003))
        objects.append(prism('Coral broad tongue '+side,shifted([(-.026,.103,.014),(.026,.103,.014),(.031,.015,.137),(-.031,.015,.137)]),primary,.005))
        # Top seam descends the nose, creating the split-front visual landmark.
        objects.append(mesh('Charcoal central split seam '+side,shifted([(-.007,.016,.150),(.007,.016,.150),(-.009,-.006,.211),(.009,-.006,.211),(-.010,-.021,.231),(.010,-.021,.231)]),[(0,1,3,2),(2,3,5,4)],secondary,None))
        objects.append(prism('Citron heel pull '+side,shifted([(-.012,.062,-.061),(.012,.062,-.061),(.013,.125,-.070),(-.013,.125,-.070)]),accent,.006))
        sock=section('Flexible charcoal ankle fabric '+side,[(.145,sign*.223,.004,.037,.040),(.220,sign*.217,-.007,.042,.044),(.305,sign*.210,-.009,.048,.047),(.356,sign*.204,-.010,.057,.054)],secondary,n=10,cap=False)
        sock['ankle_fabric']=True;objects.append(sock)
    return finish_part(root,record,objects,'footwear')


def make_pack():
    root,record=asset('acc-sunline-envelope','Sunline envelope pack','accessory','Wide folded delivery-envelope backpack with a sculpted V-flap, angular gussets and two broad attachment straps. Chest/hips skin shares the body-volume field.')
    record['tags']=['back-mounted'];objects=[]
    objects.append(bake(box('Wide folded envelope body',(0,1.315,-.249),(.309,.318,.118),trim,None,.018)))
    # The rear-most surfaces are triangular folds, rather than a generic box.
    rear_start=len(objects)
    objects.append(prism('Coral descending envelope fold',[(-.149,1.459,-.352),(.149,1.459,-.352),(.127,1.332,-.370),(0,1.263,-.392),(-.130,1.335,-.370)],primary,-.007))
    objects.append(prism('Cream envelope triangular seal',[(-.136,1.457,-.365),(.134,1.457,-.365),(.021,1.354,-.391)],trim,-.009))
    objects.append(prism('Charcoal lower origami gusset',[(-.142,1.169,-.350),(.142,1.169,-.350),(.019,1.287,-.388),(-.018,1.287,-.388)],secondary,-.008))
    objects.append(bake(box('Citron envelope latch',(0,1.283,-.401),(.035,.049,.020),accent,None,.003)))
    for obj in objects[rear_start:]:
        bake(obj)
        for v in obj.data.vertices:v.co.y-=.032
    for sign in [-1,1]:
        objects.append(bake(box('Padded pack back contact '+str(sign),(sign*.09,1.315,-.173),(.043,.198,.043),secondary,None,.009)))
        points=[(sign*.094,1.435,-.180),(sign*.115,1.499,-.120),(sign*.142,1.541,-.035),(sign*.152,1.520,.067),(sign*.139,1.453,.161),(sign*.133,1.347,.197),(sign*.136,1.221,.192),(sign*.130,1.134,.154),(sign*.146,1.128,.065),(sign*.143,1.181,-.115),(sign*.106,1.210,-.190)]
        vertices=[]
        for x,y,z in points:vertices.extend([(x-.020,y,z),(x+.020,y,z),(x-.020,y,z-.013),(x+.020,y,z-.013)])
        faces=[]
        for i in range(len(points)-1):
            a=4*i;b=a+4
            faces.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)])
        strap=mesh('Broad connected courier shoulder strap '+str(sign),vertices,faces,secondary,None);objects.append(strap)
        objects.append(bake(box('Cream strap keeper '+str(sign),(sign*.136,1.375,.203),(.037,.042,.014),trim,None,.004)))
        objects.append(bake(box('Citron strap signal '+str(sign),(sign*.135,1.331,.205),(.020,.025,.012),accent,None,.002)))
    return finish_part(root,record,objects,'shirt',[(obj,torso_weight)for obj in objects])

make_visor();make_jacket();make_pants();make_shoes();make_pack()
# The edit scene retains all five parts, unchanged rest rig, real vertex groups
# and canonical palette. Review geometry is separately loaded through runtime.
scene.name='SUNLINE COURIER · editable source'
for root in roots:
    root.hide_render=False
    for obj in [root,*root.children_recursive]:obj.hide_render=False;obj['sunlineSource']=True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/sunline-courier.blend'),compress=True)
print('SUNLINE_TOTAL',sum(record['triangles'] for record in assets),sum(record['bytes'] for record in assets),flush=True)
