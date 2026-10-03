"""MOONWAKE FESTIVAL: five original interchangeable sculpted components.

blender -b --python assets/source/moonwake_set.py
Uses established rig/export helpers only; never rebuilds existing models.
Runtime coordinates metres, Y up, +Z forward. Concept is original planning art.
"""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector, Matrix
ROOT=Path(__file__).resolve().parents[2]
ref=(ROOT/'assets/source/reference_kit.py').read_text()
exec(compile(ref.split('\nmake_body()\n')[0], 'reference_kit_helpers', 'exec'), globals())
CAPSULE=ROOT/'public/capsule';OUT=CAPSULE/'models';OUT.mkdir(parents=True,exist_ok=True)
PARTS=CAPSULE/'parts';PARTS.mkdir(parents=True,exist_ok=True)
assets=[];roots=[]
for m,c in [(primary,'#383a68'),(secondary,'#23283f'),(trim,'#d9c8ed'),(accent,'#ffc986')]:color(m,c)

def bake(o):
    matrix=o.matrix_basis.copy()
    for v in o.data.vertices:v.co=matrix@v.co
    o.matrix_basis=Matrix.Identity(4);return o

def plate(name,points,material,depth=.007):
    n=len(points);vs=points+[(x,y,z-depth) for x,y,z in points]
    fs=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,material,None)

def finish(r,d,objects,kind,weight_override=None):
    for o in objects:bake(o)
    if kind:
        bind(r,d,objects,kind)
        if weight_override:
            for oi,o in enumerate(objects):
                for v in o.data.vertices:
                    ws=weight_override(oi,o,v)
                    if ws is None:continue
                    for g in o.vertex_groups:g.remove([v.index])
                    total=sum(ws.values())
                    for bone,w in ws.items():
                        if w>1e-7:o.vertex_groups[bone].add([v.index],w/total,'REPLACE')
    else:
        p=mount(r,d,'head')
        for o in objects:o.parent=p
    export(r,d);d['url']='models/'+d['id']+'.glb'
    (PARTS/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n')
    print('MOONWAKE_READY',d['id'],d['triangles'],d['bytes'],flush=True)
    return r

def torso_weights(oi,o,v):
    y=v.co.z;h=1-ease(1.02,1.22,y)
    return {'chest':1-h,'hips':h}

def star(name,x,y,z,size,material,back=False):
    points=[(x,y+size,z),(x+size*.28,y+size*.26,z),(x+size*.73,y,z),(x+size*.28,y-size*.22,z),(x,y-size,z),(x-size*.28,y-size*.22,z),(x-size*.73,y,z),(x-size*.28,y+size*.26,z)]
    return plate(name,points,material,-.010 if back else .010)

# Cut the lavender origami panels into the supporting cloth topology itself.
# Separate interpolated-weight overlays do not exactly follow a coarse LBS
# triangle during a bend: splitting the support avoids z-fighting/float entirely.
def supported_inlay(surface,outline,material_index):
    area=sum(outline[i][0]*outline[(i+1)%len(outline)][1]-outline[(i+1)%len(outline)][0]*outline[i][1] for i in range(len(outline)))
    if area<0:outline=list(reversed(outline))
    surface.data.calc_loop_triangles()
    points=[(v.co.x,v.co.z,-v.co.y)for v in surface.data.vertices]
    lookup={tuple(round(c,7)for c in p):i for i,p in enumerate(points)}
    faces=[];mats=[]
    def clip(poly,a,b,inside=True):
        result=[]
        def signed(p):return ((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))*(1 if inside else -1)
        for p,q in zip(poly,poly[1:]+poly[:1]):
            dp,dq=signed(p),signed(q);ip,iq=dp>=-1e-9,dq>=-1e-9
            if ip:result.append(p)
            if ip!=iq:
                t=dp/(dp-dq);result.append(tuple(p[k]+t*(q[k]-p[k])for k in range(3)))
        return result
    def emit(poly,mi):
        ids=[]
        for p in poly:
            key=tuple(round(c,7)for c in p)
            if key not in lookup:lookup[key]=len(points);points.append(p)
            if not ids or ids[-1]!=lookup[key]:ids.append(lookup[key])
        if len(ids)>2 and ids[0]==ids[-1]:ids.pop()
        if len(set(ids))<3:return
        faces.append(ids);mats.append(mi)
    xmin,xmax=min(p[0]for p in outline),max(p[0]for p in outline)
    ymin,ymax=min(p[1]for p in outline),max(p[1]for p in outline)
    for triangle in surface.data.loop_triangles:
        poly=[points[i]for i in triangle.vertices];mi=triangle.material_index
        if min(p[2]for p in poly)<0 or min(p[0]for p in poly)>xmax or max(p[0]for p in poly)<xmin or min(p[1]for p in poly)>ymax or max(p[1]for p in poly)<ymin:
            emit(poly,mi);continue
        for i,a in enumerate(outline):
            b=outline[(i+1)%len(outline)];outside=clip(poly,a,b,False);emit(outside,mi);poly=clip(poly,a,b,True)
            if len(poly)<3:break
        if len(poly)>=3:emit(poly,material_index)
    materials=list(surface.data.materials)
    data=bpy.data.meshes.new(surface.name+' supported folded panels');data.from_pydata([co(p)for p in points],[],faces);data.update()
    for material in materials:data.materials.append(material)
    for polygon,mi in zip(data.polygons,mats):polygon.material_index=mi
    surface.data=data

def make_tunic():
    r,d=asset('shirt-moonwake-festival','Moonwake folded festival tunic','shirt','Architectural boxy tunic with continuous shoulder branches, flared short sleeves, broad folded cuffs, asymmetric origami collar and star-cut hem panels.');d['covers']=['torso']
    base=torso_surface('Continuous V-neck jersey · Moonwake sculpted tunic',True)
    vs=[(v.co.x,v.co.z,-v.co.y)for v in base.data.vertices[:128]]
    # This is a separately sculpted silhouette; only the proven connected
    # shoulder junction topology is inherited from the rig's authoring helper.
    rows=[(.983,.231,.151),(1.06,.239,.153),(1.18,.211,.139),(1.31,.203,.138),(1.375,.209,.131),(1.505,.218,.123),(1.546,.089,.101),(1.572,.067,.080)]
    for row,(y,rx,rz) in enumerate(rows):
        for j in range(16):
            a=j*math.tau/16;x=math.sin(a)*rx;z=math.cos(a)*rz
            yy=y
            if row==0:yy+=.045*abs(math.sin(a))-.030*max(0,math.cos(a))
            if row==5:yy-=.080*max(0,1-abs(x)/.15)*max(0,math.cos(a))
            if row>=6:yy-=.08*max(0,math.cos(a))**1.6
            if row>=6 and math.cos(a)<0:z*=.70
            vs[row*16+j]=(x,yy,z)
    fs=[tuple(p.vertices) for p in base.data.polygons if max(p.vertices)<128]
    mats=[]
    for f in fs:
        y=sum(vs[i][1] for i in f)/len(f);x=sum(vs[i][0]for i in f)/len(f)
        mats.append(1 if y<1.04 else 0)
    for sign,indices in [(1,[67,68,69,85,84,83]),(-1,[77,76,75,91,92,93])]:
        last=indices
        for step,(y,x,rx,rz) in enumerate([(1.432,.237,.083,.106),(1.321,.29,.091,.109),(1.292,.295,.094,.111),(1.285,.291,.085,.100)]):
            ids=[]
            for ax,az in [(-.5,.866),(-1,0),(-.5,-.866),(.5,-.866),(1,0),(.5,.866)]:
                ids.append(len(vs));vs.append((sign*(x+ax*rx),y+ax*rx*.25,az*rz+.004))
            for j in range(6):fs.append((last[j],last[(j+1)%6],ids[(j+1)%6],ids[j]));mats.append(2 if step>=2 else 0)
            last=ids
    bpy.data.objects.remove(base,do_unlink=True)
    tunic=mesh('Moonwake connected box tunic and folded sleeve cuffs',vs,fs,primary,None)
    tunic.data.materials.append(secondary);tunic.data.materials.append(trim)
    for p,m in zip(tunic.data.polygons,mats):p.material_index=m
    objects=[tunic]
    objects.append(section('Faceted standing collar',[(1.490,0,-.02,.087,.083),(1.572,0,-.028,.081,.068),(1.585,0,-.028,.086,.073)],secondary,n=12,cap=False))
    objects.append(plate('Broad folded collar left',[(-.12,1.521,.072),(-.052,1.575,.083),(.104,1.471,.132),(.037,1.392,.155),(-.015,1.457,.148)],trim,.012))
    objects.append(plate('Broad folded collar right',[(.116,1.525,.076),(.05,1.57,.086),(-.113,1.474,.131),(-.06,1.443,.154),(.015,1.479,.153)],primary,.012))
    objects.append(plate('Raised collar fold',[(.05,1.569,.095),(-.115,1.478,.143),(-.091,1.464,.153),(.072,1.554,.11)],trim,.007))
    # Angular hem gussets are chest/hips-owned, never erroneously arm weighted.
    original_cloth_vertices=len(tunic.data.vertices)
    for s in [-1,1]:
        supported_inlay(tunic,[(s*.096,1.21),(s*.218,1.00),(s*.11,1.015),(s*.07,1.052)],2)
        objects.append(star('Pressed chest star '+str(s),s*.152,1.409,.115,.037,accent))
    objects.append(plate('Folded festival placket',[(.031,1.39,.164),(.053,1.39,.16),(.032,1.065,.163),(.009,1.042,.164)],secondary))
    objects.append(star('Central star clasp',.04,1.313,.178,.032,accent))
    objects.append(plate('Back folded yoke',[(-.167,1.442,-.085),(0,1.355,-.152),(.167,1.442,-.085),(.12,1.405,-.13),(0,1.305,-.151),(-.12,1.405,-.13)],trim,-.009))
    def weights(oi,o,v):
        if oi==0:
            if v.index<128 or v.index>=original_cloth_vertices:return torso_weights(oi,o,v)
            # Sleeve rings share the anatomical arm, but the very first ring
            # blends back to chest at the inner armhole.
            side='R'if v.co.x>0 else'L';ring=((v.index-128)//6)%4
            reach=.80 if ring==0 else 1
            return {'chest':1-reach,'arm_'+side:reach}
        return torso_weights(oi,o,v)
    return finish(r,d,objects,'shirt',weights)

def make_trousers():
    r,d=asset('bottom-moonwake-wide','Moonwake balloon trousers','bottom','Sculpted balloon trousers with a welded fork, deep faceted volume, thigh-to-shin articulation and high folded lavender cuffs.');d['covers']=['upper-legs']
    vs=[];fs=[]
    # Shared waist/seat, with two distinct leg loops and a welded central fork.
    for front in [1,-1]:
        base=len(vs)
        for x,z in [(-.199,0),(-.170,.083),(-.12,.119),(-.06,.132),(0,.137),(.06,.132),(.12,.119),(.17,.083),(.199,0)]:vs.append((x,1.048,z*front))
        for x,z in [(-.226,0),(-.193,.104),(-.135,.141),(-.072,.125),(0,.075),(.072,.125),(.135,.141),(.193,.104),(.226,0)]:vs.append((x,.883 if x==0 else .96,z*front))
        for x,z in [(-.271,0),(-.232,.111),(-.153,.15),(-.072,.112),(-.034,0),(.034,0),(.072,.112),(.153,.15),(.232,.111),(.271,0)]:vs.append((x,.806,z*front))
        for j in range(8):fs.append(tuple(base+i for i in (j,j+1,j+10,j+9)))
        for j in range(4):fs.append(tuple(base+i for i in (9+j,10+j,19+j,18+j)))
        for j in range(4):fs.append(tuple(base+i for i in (13+j,14+j,24+j,23+j)))
    # Exact legacy waist/upper-seat interface; balloon volume begins below it.
    # The first concept pass made this upper envelope too deep under other tops.
    waist=[(-.174,0),(-.146,.067),(-.104,.096),(-.052,.107),(0,.107),(.052,.107),(.104,.096),(.146,.067),(.174,0)]
    seat=[(-.187,0),(-.156,.085),(-.106,.123),(-.056,.105),(0,.074),(.056,.105),(.106,.123),(.156,.085),(.187,0)]
    for front_base,sign in [(0,1),(28,-1)]:
        for j,(x,z) in enumerate(waist):vs[front_base+j]=(x,1.047,z*sign)
        for j,(x,z) in enumerate(seat):vs[front_base+9+j]=(x,.916 if x==0 else .948,z*sign)
    fs += [(13,41,50,22),(13,23,51,41)]
    # Front outer-to-inner then rear inner-to-outer; 8 broad facets each leg.
    for s,last in [(-1,[18,19,20,21,22,49,48,47]),(1,[23,24,25,26,27,54,53,52])]:
        # The right loop is inner-to-outer; keep its own angular direction.
        if s<0:angles=[-math.pi/2,-math.pi/4,0,math.pi/4,math.pi/2,3*math.pi/4,math.pi,5*math.pi/4]
        else:angles=[-math.pi/2,-math.pi/4,0,math.pi/4,math.pi/2,3*math.pi/4,math.pi,5*math.pi/4]
        for y,cx,rx,rz in [(.69,.161,.14,.153),(.625,.17,.15,.164),(.56,.18,.157,.17),(.51,.185,.15,.151),(.397,.199,.125,.119),(.352,.205,.090,.086)]:
            ids=[]
            for a in angles:ids.append(len(vs));vs.append((s*cx+rx*math.sin(a),y,.009+rz*math.cos(a)))
            for j in range(8):fs.append((last[j],last[(j+1)%8],ids[(j+1)%8],ids[j]))
            last=ids
    pants=mesh('Welded fork and articulated faceted balloon legs',vs,fs,primary,None)
    bm=bmesh.new();bm.from_mesh(pants.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(pants.data);bm.free()
    objects=[pants,section('Wide festival waistband',[(1.029,0,0,.174,.108),(1.058,0,0,.169,.104)],secondary,n=16,cap=False)]
    for s in [-1,1]:
        cuff=section('High folded cuff '+str(s),[(.313,s*.209,.008,.075,.078),(.322,s*.209,.008,.087,.087),(.37,s*.204,.008,.101,.094),(.38,s*.204,.008,.094,.086)],trim,n=8,cap=False)
        objects.append(cuff)
        objects.append(plate('Pleated side fold '+str(s),[(s*.256,.78,.081),(s*.29,.55,.090),(s*.238,.408,.101),(s*.264,.55,.130)],secondary))
        objects.append(star('Trouser star '+str(s),s*.217,.63,.157,.035,accent))
    objects.append(plate('Waist clasp',[(-.021,1.053,.113),(.02,1.053,.113),(.02,1.025,.114),(-.021,1.025,.114)],accent))
    def weights(oi,o,v):
        x,y=v.co.x,v.co.z
        if y>=.82:return None
        side='R'if x>0 else'L';knee=1-ease(.49,.64,y)
        return {'leg_'+side:1-knee,'shin_'+side:knee}
    return finish(r,d,objects,'leg',weights)

def make_boots():
    r,d=asset('shoes-moonwake-platform','Moonwake platform ankle boots','shoes','Angular ankle boots with a thick lavender platform, inset tread panels, folded ivory vamp and articulated ankle cuff.');d['covers']=['feet'];objects=[]
    outline=[(0,.239),(.069,.222),(.091,.17),(.089,.058),(.070,-.063),(.040,-.089),(-.040,-.089),(-.070,-.063),(-.089,.058),(-.091,.17),(-.069,.222)]
    for s in [-1,1]:
        cx=s*.225; n=len(outline);vs=[]
        for y,scale in [(.002,.94),(.014,1),(.067,1),(.08,.93)]:vs += [(cx+x*scale,y,z)for x,z in outline]
        fs=[tuple(reversed(range(n))),tuple(range(3*n,4*n))]
        for row in range(3):
            for j in range(n):a=row*n+j;b=row*n+(j+1)%n;fs.append((a,b,b+n,a+n))
        soleobj=mesh('Chunky bevelled platform '+str(s),vs,fs,trim,None);soleobj.data.materials.append(secondary)
        for p in soleobj.data.polygons:
            if p.index==0 or 2<=p.index<2+n:p.material_index=1
        objects.append(soleobj)
        # Longitudinal shell: cropped high ankle, lifted instep, broad blunt toe.
        vs=[];fs=[];count=8
        for z,width,top in [(-.083,.037,.137),(-.057,.066,.229),(.012,.072,.242),(.077,.078,.190),(.16,.08,.130),(.219,.06,.104),(.237,.015,.088)]:
            for j in range(count):a=j*math.tau/count;vs.append((cx+math.sin(a)*width,(.071+top)/2+math.cos(a)*(top-.071)/2,z))
        for row in range(6):
            for j in range(count):
                if row in[1,2]and j in[0,7]:continue
                a=row*count+j;b=row*count+(j+1)%count;fs.append((a,b,b+count,a+count))
        fs += [tuple(reversed(range(count))),tuple(range(6*count,7*count))]
        upper=mesh('Faceted boot upper '+str(s),vs,fs,secondary,None);upper.data.materials.append(trim)
        for p in upper.data.polygons:
            if sum(vs[i][2]for i in p.vertices)/len(p.vertices)>.035:p.material_index=1
        objects.append(upper)
        sock=section('Calf-following midnight sock '+str(s),[(.19,cx-s*.007,-.007,.044,.047),(.272,cx-s*.013,-.008,.048,.052),(.363,cx-s*.026,-.01,.062,.064)],secondary,n=10,cap=False);sock['ankle_fabric']=True;objects.append(sock)
        # Floating collar avoided: ankle fabric shares shin/foot skin weights.
        collar=section('Flexible ankle collar '+str(s),[(.17,cx,.001,.072,.069),(.222,cx-s*.008,-.001,.070,.066),(.257,cx-s*.013,-.005,.065,.062)],primary,n=8,cap=False);collar['ankle_fabric']=True;objects.append(collar)
        band=section('Folded ankle binding '+str(s),[(.237,cx-s*.012,-.005,.068,.065),(.256,cx-s*.013,-.005,.068,.065)],trim,n=8,cap=False);band['ankle_fabric']=True;objects.append(band)
        objects.append(plate('Folded boot tongue '+str(s),[(cx-.032,.239,.067),(cx+.032,.239,.067),(cx+.04,.143,.159),(cx-.038,.143,.159)],primary,.009))
        for x in [-.065,0,.065]:
            objects.append(plate('Platform front tread '+str(s),[(cx+x-.012,.057,.229-abs(x)*.20),(cx+x+.012,.057,.229-abs(x)*.20),(cx+x+.010,.013,.232-abs(x)*.20),(cx+x-.010,.013,.232-abs(x)*.20)],secondary,.004))
        objects.append(star('Boot star clasp '+str(s),cx,.204,.1,.025,accent))
    return finish(r,d,objects,'footwear')

def make_crescent():
    r,d=asset('hat-moonwake-crescent','Moonwake crescent band','headwear','Open crown faceted band with a raised crescent and side star. Natural hair occlusion preserves every original hairstyle.');d['hairFit']=[{'targetSlot':'hair','mode':'occlude'}]
    objects=[]
    # Rigid head-local field clears the broader Spark forehead, with no hair cut.
    objects.append(section('Open crown band',[(.107,0,-.011,.200,.200),(.128,0,-.011,.200,.200)],secondary,n=24,cap=False))
    objects.append(section('Band upper edge',[(.124,0,-.011,.203,.203),(.132,0,-.011,.203,.203)],accent,n=24,cap=False))
    # True crescent polygon, concave silhouette with an extruded back, rather
    # than a textured moon circle. Construct a strip to make triangulation safe.
    vs=[];fs=[];steps=12
    for i in range(steps+1):
        a=(math.pi/2)+i*math.pi/steps
        vs +=[(.035+.069*math.cos(a),.181+.069*math.sin(a),.202),(.035+.036*math.cos(a)+.018*math.sin(i*math.pi/steps),.181+.069*math.sin(a),.212)]
    for i in range(steps):fs.append((i*2,i*2+1,i*2+3,i*2+2))
    crescent=mesh('Sculpted crescent',vs,fs,accent,None);solid=crescent.modifiers.new('Moon thickness','SOLIDIFY');solid.thickness=.012;bpy.context.view_layer.objects.active=crescent;bpy.ops.object.modifier_apply(modifier=solid.name);objects.append(crescent)
    objects.append(star('Band star',-.128,.139,.176,.030,trim))
    objects.append(plate('Crescent mounting tab',[(-.016,.125,.203),(.008,.125,.203),(.008,.165,.207),(-.016,.165,.207)],secondary,.012))
    return finish(r,d,objects,None)

def make_lantern():
    r,d=asset('acc-moonwake-lantern','Moonwake lantern backpack','accessory','Compact rigid rib-framed festival lantern with broad shoulder straps, faceted roof and base. Decorative peach panels use the existing palette, without light effects or runtime extensions.');d['tags']=['back-mounted'];objects=[]
    # A shaped saddle visibly supports the intentional shell clearance.
    objects.append(plate('Padded mounting saddle',[(-.071,1.424,-.166),(.071,1.424,-.166),(.083,1.235,-.17),(.052,1.19,-.17),(-.052,1.19,-.17),(-.083,1.235,-.17)],secondary,-.058))
    # Main volume clears broad torso layers by >= 30 mm in the rest pose.
    objects.append(section('Faceted peach lantern',[(1.09,0,-.322,.084,.081),(1.14,0,-.322,.112,.101),(1.395,0,-.322,.125,.108),(1.421,0,-.322,.119,.102)],accent,n=6))
    objects.append(section('Lantern base frame',[(1.075,0,-.322,.082,.077),(1.10,0,-.322,.113,.105),(1.126,0,-.322,.118,.109)],secondary,n=6))
    objects.append(section('Lantern roof folded eaves',[(1.4,0,-.322,.134,.118),(1.428,0,-.322,.134,.118),(1.483,0,-.322,.056,.047),(1.496,0,-.322,.056,.047)],secondary,n=6))
    for j in range(6):
        a=j*math.tau/6
        objects.append(tube('Lantern upright rib '+str(j),[(math.sin(a)*.116,1.11,-.322+math.cos(a)*.109),(math.sin(a)*.129,1.419,-.322+math.cos(a)*.113)],.012,primary,n=4))
    # Broad diagonal ribs on the visible rear face give the pack its identity.
    for s in [-1,1]:objects.append(tube('Lantern crossed rear rib '+str(s),[(s*.09,1.135,-.415),(-s*.097,1.402,-.430)],.010,trim,n=4))
    objects.append(tube('Lantern top handle',[(-.043,1.478,-.322),(-.043,1.522,-.322),(.043,1.522,-.322),(.043,1.478,-.322)],.01,trim,n=4))
    objects.append(star('Lantern rear base star',0,1.094,-.414,.032,accent,True))
    for s in [-1,1]:
        points=[(s*.077,1.421,-.209),(s*.12,1.477,-.157),(s*.142,1.523,-.085),(s*.147,1.535,.022),(s*.151,1.480,.128),(s*.151,1.395,.169),(s*.164,1.273,.170),(s*.177,1.17,.158),(s*.193,1.143,.072),(s*.177,1.188,-.133),(s*.089,1.162,-.215)]
        vs=[]
        for x,y,z in points:vs.extend([(x-.017,y,z),(x+.017,y,z)])
        fs=[(i*2,i*2+1,i*2+3,i*2+2)for i in range(len(points)-1)]
        strap=mesh('Broad lantern shoulder strap '+str(s),vs,fs,secondary,None);solid=strap.modifiers.new('Closed substantial webbing','SOLIDIFY');solid.thickness=.012;bpy.context.view_layer.objects.active=strap;bpy.ops.object.modifier_apply(modifier=solid.name);objects.append(strap)
        objects.append(star('Strap star '+str(s),s*.152,1.376,.183,.028,trim))
    for o in objects:
        if o.name.startswith(('Faceted peach','Lantern','Sculpted lantern')):
            for v in o.data.vertices:v.co.y-=.03
    return finish(r,d,objects,'shirt',torso_weights)

make_tunic();make_trousers();make_boots();make_crescent();make_lantern()
for root in roots:
    for o in [root]+list(root.children_recursive):o.hide_render=False;o['moonwakeSource']=True
# Dedicated, completely editable authoring scene, all exported geometry/weights.
scene.name='MOONWAKE · five independent source components'
scene['sourceConcept']='docs/references/moonwake/concept.jpg'
scene['runtimeRig']='athlete-reference-v2'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/moonwake-set.blend'),compress=True)
print('TOTAL_TRIANGLES',sum(d['triangles']for d in assets),flush=True)
