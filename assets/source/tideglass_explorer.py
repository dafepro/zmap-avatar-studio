"""Tideglass Explorer: original five-piece collectible set.
Rebuild with: blender -b --python assets/source/tideglass_explorer.py
Only own capsule descriptors/models are written. Shared helpers supply the rig,
export validation and the connected anatomical shoulder seam, not the design.
"""
import bpy, json, math, bmesh
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2]
ref=(ROOT/'assets/source/reference_kit.py').read_text()
exec(compile(ref.split('\nmake_body()\n')[0], 'reference_helpers', 'exec'),globals())
CAPSULE=ROOT/'public/capsule'; OUT=CAPSULE/'models';OUT.mkdir(parents=True,exist_ok=True)
PARTS=CAPSULE/'parts';PARTS.mkdir(exist_ok=True)
assets=[];roots=[]
for m,c in [(primary,'#277f8d'),(secondary,'#203e50'),(trim,'#afe4ee'),(accent,'#ed9551')]:color(m,c)


def bake(o):
    for v in o.data.vertices:v.co=o.matrix_basis@v.co
    o.matrix_basis=Matrix.Identity(4)
    return o


def prism(name,points,material,depth=.008):
    n=len(points);vs=points+[(x,y,z-depth)for x,y,z in points]
    fs=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
    return mesh(name,vs,fs,material,None)


def shield(name,points,center,material,depth=.008):
    """Closed low-poly convex shell with designed radial facets."""
    n=len(points);vs=points+[center]+[(x,y,z-depth)for x,y,z in points]+[(center[0],center[1],sum(p[2]for p in points)/n-depth)]
    fs=[(i,(i+1)%n,n)for i in range(n)]+[(n+1+(i+1)%n,n+1+i,2*n+1)for i in range(n)]+[(i,n+1+i,n+1+(i+1)%n,(i+1)%n)for i in range(n)]
    return mesh(name,vs,fs,material,None)


def mounted_shield(name, outline, center, material, cloth_sample, role, direction=1):
    # The visible shell is proud by 14–28mm, while its return walls terminate
    # on the actual cloth. Backing is intentionally allowed to overlap cloth
    # by 1mm so a sewn/bolted mounting edge cannot look like a floating card.
    points=[(x,y,cloth_sample(x,y,0)+direction*.027)for x,y in outline]
    n=len(points);cx,cy=center;frontcenter=(cx,cy,cloth_sample(cx,cy,0)+direction*.047)
    front=mesh(name+' face',points+[frontcenter],[(i,(i+1)%n,n)for i in range(n)],material,None)
    front['torsoOnly']=True;front['shellFaceRole']=role
    back=[(x,y,cloth_sample(x,y,0)-direction*.001)for x,y in outline]
    backcenter=(cx,cy,cloth_sample(cx,cy,0)-direction*.001)
    vs=points+back+[backcenter]
    fs=[(n+(i+1)%n,n+i,2*n)for i in range(n)]+[(i,n+i,n+(i+1)%n,(i+1)%n)for i in range(n)]
    mounting=mesh(name+' sewn mounting',vs,fs,material,None);mounting['torsoOnly']=True;mounting['shellMount']=True
    return [front,mounting]


def sampler(o,back=False):
    tree=BVHTree.FromPolygons([v.co[:]for v in o.data.vertices],[p.vertices[:]for p in o.data.polygons])
    def sample(x,y,margin=.012):
        hit=tree.ray_cast(Vector(co((x,y,-1 if back else 1))),Vector(co((0,0,1 if back else -1))))[0]
        if hit is None:raise ValueError('No cloth surface at '+str((x,y)))
        return -hit.y+(-margin if back else margin)
    return sample


def set_weights(o,fun):
    for v in o.data.vertices:
        for g in o.vertex_groups:g.remove([v.index])
        ws=fun(v);total=sum(ws.values())
        for bone,w in ws.items():
            if w>1e-8:o.vertex_groups[bone].add([v.index],w/total,'REPLACE')


def torso_weights(v):
    hip=1-ease(1.02,1.22,v.co.z)
    return {'chest':1-hip,'hips':hip}


def finish_piece(r,d,objects,kind):
    for o in objects:
        bake(o)
        name=o.name
        o['fitRole']=('cloth' if name.startswith(('Continuous V-neck','Welded articulated','Technical bound')) else
          'panel-front' if o.get('panelFace') else 'panel-mount' if o.get('panelMount') else
          o.get('shellFaceRole') if o.get('shellFaceRole') else 'shell-mount' if o.get('shellMount') else
          'chest-shell' if name.startswith('Glazed chest') else 'waist-shell' if name.startswith('Waist shell') else
          'back-shell' if name.startswith('Rear shell') else 'knee-panel' if name.startswith('Articulated kneecap') else
          'shin-panel' if name.startswith('Lower shin') else 'ankle-fabric' if o.get('ankle_fabric') else
          'strap' if name.startswith('Closed shoulder') else 'mount-pad' if name.startswith('Soft back mounting') else
          'pod' if name.startswith(('Compact reef','Glazed pod')) else 'fin' if 'fin' in name.lower() else
          'rigid-boot' if kind=='footwear' else 'detail')
    if kind:
        bind(r,d,objects,kind)
        for o in objects:
            if o.get('torsoOnly'):set_weights(o,torso_weights)
            elif o.name.startswith('Continuous V-neck jersey'):
                for v in o.data.vertices:
                    if v.index<128 and v.co.z<1.31:
                        for g in o.vertex_groups:g.remove([v.index])
                        for bone,w in torso_weights(v).items():
                            if w>0:o.vertex_groups[bone].add([v.index],w,'REPLACE')
        # Transfer the actual connected cloth's barycentric skin ownership to
        # shell fronts and their sewn returns. The shoulder seam has a solved
        # reach field; a generic chest-only guess is not equivalent in a wave.
        cloth=next((o for o in objects if o.name.startswith('Continuous V-neck jersey')),None)
        if cloth is not None:
            from mathutils.geometry import barycentric_transform
            cloth.data.calc_loop_triangles()
            triangles=[tuple(t.vertices)for t in cloth.data.loop_triangles]
            tree=BVHTree.FromPolygons([v.co[:]for v in cloth.data.vertices],triangles,all_triangles=True)
            for o in objects:
                if not (o.get('shellFaceRole') or o.get('shellMount')):continue
                for v in o.data.vertices:
                    front=-v.co.y>0;hit,normal,index,distance=tree.ray_cast(Vector(co((v.co.x,v.co.z,1 if front else -1))),Vector(co((0,0,-1 if front else 1))))
                    if hit is None:raise ValueError('Panel skin transfer lost cloth')
                    indices=triangles[index];a,b,c=[cloth.data.vertices[i].co for i in indices]
                    factors=barycentric_transform(hit,a,b,c,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
                    weights={}
                    for vi,factor in zip(indices,factors):
                        for group in cloth.data.vertices[vi].groups:
                            bone=cloth.vertex_groups[group.group].name;weights[bone]=weights.get(bone,0)+max(0,factor)*group.weight
                    for group in o.vertex_groups:group.remove([v.index])
                    total=sum(weights.values())
                    for bone,w in weights.items():
                        if w>1e-8:o.vertex_groups[bone].add([v.index],w/total,'REPLACE')
    else:
        pivot=mount(r,d,'head')
        for o in objects:o.parent=pivot
    export(r,d)
    (PARTS/(d['id']+'.json')).write_text(json.dumps(d,indent=2)+'\n')
    print('TIDEGLASS_READY',d['id'],d['triangles'],d['bytes'],flush=True)


def make_hat():
    r,d=asset('hat-tideglass-fin','Tideglass fin crown','headwear','Open angular headband with two swept temple fins; natural hair occlusion, no hairstyle variants.')
    d['hairFit']=[{'targetSlot':'hair','mode':'occlude'}]
    objects=[]
    # Head-local band follows the broader Spark envelope, with a planar forehead
    # bridge outside its broad front planes rather than an intersecting ellipse.
    path=[(-.191,.070,-.11),(-.197,.100,-.045),(-.183,.121,.07),(-.137,.137,.150),(-.073,.145,.168),(0,.149,.178),(.073,.145,.168),(.137,.137,.150),(.183,.121,.07),(.197,.100,-.045),(.191,.070,-.11)]
    vs=[]
    for x,y,z in path:vs.extend([(x,y-.015,z),(x,y+.015,z),(x,y+.015,z-.010),(x,y-.015,z-.010)])
    fs=[(0,3,2,1),tuple(range((len(path)-1)*4,len(path)*4))]
    for i in range(len(path)-1):
        for j in range(4):a=i*4+j;b=i*4+(j+1)%4;fs.append((a,b,b+4,a+4))
    objects.append(mesh('Open fin headband',vs,fs,primary,None))
    for s in [-1,1]:
        objects.append(shield('Swept temple fin '+str(s),[(s*.175,.110,.115),(s*.212,.082,.072),(s*.244,.190,-.055),(s*.216,.227,-.027)],(s*.222,.155,.045),trim,.012))
        objects.append(prism('Coral temple tab '+str(s),[(s*.177,.092,.124),(s*.211,.077,.082),(s*.218,.090,.077),(s*.182,.108,.127)],accent,.007))
    finish_piece(r,d,objects,None)


def make_shirt():
    r,d=asset('shirt-tideglass-shell','Tideglass shell top','shirt','Sculpted faceted chest shell, integrated angular shoulder panels and split standing collar over a complete flexible short-sleeve base.')
    d['covers']=['torso']
    base=torso_surface('Continuous V-neck jersey · Tideglass flexible base',True)
    for v in base.data.vertices:
        x,y,z=v.co.x,v.co.z,-v.co.y
        # Squared continuous hem and generous shell-bearing breast volume.
        if v.index<128:
            row=v.index//16
            x*=1.035;z*=1.08
            if row<2:y+=.012
        else:
            # A slightly angular wider shoulder, tapering to the short cuff.
            x*=1.015;z*=1.07
        v.co=co((x,y,z))
    base.data.materials.clear();base.data.materials.append(secondary);base.data.materials.append(primary);base.data.materials.append(trim)
    for p in base.data.polygons:
        # True shoulder facets are part of the base topology and cannot float
        # through their own sleeve when the arm swings.
        c=p.center
        ids=list(p.vertices)
        if min(ids)>=128 and (min(ids)-128)%18<12:p.material_index=1
    for p in base.data.polygons:
        center=sum((base.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
        if 1.03<center.z<1.22 and abs(center.x)>.12 and -center.y>0:p.material_index=1
    base.data.update()
    objects=[base];z=sampler(base)
    outline=[(-.153,1.407),(-.073,1.431),(0,1.402),(.073,1.431),(.153,1.407),(.129,1.289),(.051,1.233),(0,1.211),(-.051,1.233),(-.129,1.289)]
    # All rim vertices plus the triangulated face sit beyond the actual cloth.
    chest_parts=mounted_shield('Glazed chest shell',outline,(0,1.330),trim,z,'chest-shell');objects+=chest_parts;chest=chest_parts[0]
    # Center facet has its own material but shares the shield's topology.
    chest.data.materials.append(primary)
    for p in chest.data.polygons:
        if p.index in [2,3,4,7,8]:p.material_index=1
    for s in [-1,1]:
        # A tall split collar leaves the throat/face open. It is a closed wedge.
        collar=prism('Standing collar fin '+str(s),[(s*.064,1.487,.079),(s*.138,1.519,.043),(s*.151,1.601,.005),(s*.073,1.578,.007)],primary,.018);collar['torsoOnly']=True;objects.append(collar)
        panel=prism('Collar icy facing '+str(s),[(s*.079,1.495,.084),(s*.133,1.523,.052),(s*.143,1.583,.020),(s*.084,1.564,.025)],trim,.003);panel['torsoOnly']=True;objects.append(panel)
        # Waist flares are bevelled shell cuts, high enough to keep hips free.

    back=sampler(base,True)
    objects+=mounted_shield('Rear shell yoke',[(-.124,1.409),(0,1.452),(.124,1.409),(.099,1.276),(0,1.222),(-.099,1.276)],(0,1.342),primary,back,'back-shell',-1)
    finish_piece(r,d,objects,'shirt')


def conforming_panel(name, rows, sample, material):
    """A stitched shell patch: front follows sampled cloth, backing returns to
    the cloth instead of floating a planar polygon in space. Extra bend rows
    retain anatomical weights; front and mounting faces carry distinct roles."""
    front=[];back=[]
    for y,cx,half in rows:
        for j in [-1,0,1]:
            x=cx+j*half;z=sample(x,y,0)
            front.append((x,y,z+(.021 if j==0 else .012)))
            back.append((x,y,z+.001))
    faces=[]
    for r in range(len(rows)-1):
        for j in range(2):
            a=r*3+j;faces.extend([(a,a+1,a+4),(a,a+4,a+3)])
    face=mesh(name+' face',front,faces,material,None);face['family']='leg';face['panelFace']=True
    n=len(front);verts=front+back;mountfaces=[tuple(n+i for i in reversed(f))for f in faces]
    loop=list(range(3))+[r*3+2 for r in range(1,len(rows))]+[n-2,n-3]+[r*3 for r in reversed(range(1,len(rows)-1))]
    for a,b in zip(loop,loop[1:]+loop[:1]):mountfaces.append((a,b,b+n,a+n))
    mounting=mesh(name+' mounting',verts,mountfaces,material,None);mounting['family']='leg';mounting['panelMount']=True
    return [face,mounting]


def make_pants():
    r,d=asset('bottom-tideglass-tech','Tideglass technical trousers','bottom','Full-length fitted technical trousers with welded pelvis, articulated kneecaps, shin shell panels and segmented coral side tape.')
    d['covers']=['upper-legs'];objects=[];vs=[];fs=[]
    # The crotch is welded to each independently articulated eight-sided leg.
    for front in [1,-1]:
        b=len(vs)
        for x,z in [(-.181,0),(-.15,.076),(-.105,.109),(-.052,.118),(0,.118),(.052,.118),(.105,.109),(.15,.076),(.181,0)]:vs.append((x,1.055,z*front))
        for x,z in [(-.196,0),(-.164,.096),(-.11,.131),(-.055,.112),(0,.079),(.055,.112),(.11,.131),(.164,.096),(.196,0)]:vs.append((x,.915 if x==0 else .95,z*front))
        for x,z in [(-.217,0),(-.184,.089),(-.132,.125),(-.071,.093),(-.039,0),(.039,0),(.071,.093),(.132,.125),(.184,.089),(.217,0)]:vs.append((x,.787,z*front))
        for j in range(8):fs.append(tuple(b+i for i in (j,j+1,j+10,j+9)))
        for j in range(4):fs.append(tuple(b+i for i in (9+j,10+j,19+j,18+j)))
        for j in range(4):fs.append(tuple(b+i for i in (13+j,14+j,24+j,23+j)))
    fs += [(13,41,50,22),(13,23,51,41)]
    # Starting rings reuse pelvis boundaries. No intersection between thighs.
    for s,last in [(-1,[18,19,20,21,22,49,48,47]),(1,[27,26,25,24,23,52,53,54])]:
        for y,x,rx,rz,z0 in [(.694,.145,.083,.106,.009),(.635,.155,.077,.094,.012),(.610,.16,.077,.087,.013),(.585,.166,.077,.085,.013),(.560,.17,.077,.083,.013),(.535,.175,.077,.084,.010),(.513,.18,.078,.088,.006),(.492,.184,.077,.090,.003),(.410,.197,.080,.083,-.012),(.324,.208,.065,.071,-.010),(.292,.212,.059,.064,-.009)]:
            ids=[]
            for j in range(8):
                a=j*math.tau/8;ids.append(len(vs));vs.append((s*(x+rx*math.cos(a)),y,z0+rz*math.sin(a)))
            for j in range(8):fs.append((last[j],last[(j+1)%8],ids[(j+1)%8],ids[j]))
            last=ids
    cloth=mesh('Welded articulated trouser cloth',vs,fs,secondary,None)
    bm=bmesh.new();bm.from_mesh(cloth.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(cloth.data);bm.free();cloth['family']='leg';objects.append(cloth)
    objects.append(section('Technical bound waist',[(1.030,0,0,.183,.119),(1.061,0,0,.179,.116)],primary,n=16,cap=False));objects[-1]['family']='leg'
    z=sampler(cloth)
    for s in [-1,1]:
        # Separate knee and shin plates do not span a bend joint. Weights match
        # the corresponding cloth field; conservative proud rims prevent cuts.
        objects+=conforming_panel('Knee shell '+str(s),[(.635,s*.155,.045),(.610,s*.160,.053),(.585,s*.166,.053),(.560,s*.170,.035)],z,trim)
        objects+=conforming_panel('Shin shell '+str(s),[(.492,s*.184,.034),(.450,s*.190,.044),(.410,s*.197,.043),(.365,s*.204,.024)],z,primary)
        # Side tape is real closed fabric webbing with several skin samples.
        pts=[(s*.187,1.031,.005),(s*.199,.952,.004),(s*.219,.787,.004),(s*.234,.694,.01),(s*.235,.615,.015),(s*.265,.492,.003),(s*.281,.410,-.012),(s*.275,.295,-.009)]
        stripe=tube('Coral side tape '+str(s),pts,.0035,accent,n=4);stripe['family']='leg';objects.append(stripe)
    finish_piece(r,d,objects,'leg')


def make_shoes():
    r,d=asset('shoes-tideglass-reef','Tideglass reef boots','shoes','Broad low reef boots with separated glazed toe guards and low rubber sole. Thin articulated sock fabric bridges the feet coverage mask up to 0.36 metres.')
    d['covers']=['feet'];objects=[]
    for s,side in [(-1,'L'),(1,'R')]:
        x0=s*.225
        outline=[(-.071,-.083),(.071,-.083),(.095,.055),(.097,.164),(.063,.221),(-.063,.221),(-.097,.164),(-.095,.055)]
        vs=[]
        for y,scale in [(.003,.95),(.027,1),(.053,.97)]:vs +=[(x0+x*scale,y,z+.010)for x,z in outline]
        fs=[tuple(reversed(range(8))),tuple(range(16,24))]+[(r*8+j,r*8+(j+1)%8,(r+1)*8+(j+1)%8,(r+1)*8+j)for r in range(2)for j in range(8)]
        soleobj=mesh('Broad reef rubber sole '+side,vs,fs,secondary,None);objects.append(soleobj)
        # Elliptic instep loft is wide and low, with an actual sock opening.
        upper=section('Low reef instep '+side,[(.049,x0,.066,.089,.144),(.10,x0,.047,.082,.116),(.165,x0,-.003,.060,.067),(.224,x0,-.011,.053,.052)],primary,n=10,cap=False);objects.append(upper)
        for dx in [-.042,.042]:
            toe=shield('Split toe guard '+side+str(dx),[(x0+dx-.030,.068,.225),(x0+dx+.030,.068,.225),(x0+dx+.032,.100,.149),(x0+dx+.019,.123,.095),(x0+dx-.030,.113,.134)],(x0+dx,.107,.181),trim,.007);objects.append(toe)
        # Ankle upper is visually low; all rigid geometry remains below .26m.
        tab=bake(box('Coral heel tab '+side,(x0,.224,-.047),(.027,.041,.020),accent,None,.004));objects.append(tab)
        sock=section('Flexible calf liner '+side,[(.13,x0,.007,.039,.040),(.166,x0-s*.006,.005,.043,.044),(.225,x0-s*.011,.002,.046,.049),(.296,x0-s*.019,-.003,.051,.054),(.356,x0-s*.027,-.008,.058,.058)],secondary,n=12,cap=False);sock['ankle_fabric']=True;objects.append(sock)
    for obj in objects:obj['family']='footwear'
    finish_piece(r,d,objects,'footwear')


def strap(name,points,width,material):
    # Closed rectangular cross-section, substantial webbing, not wire planes.
    vs=[]
    for x,y,z in points:vs.extend([(x-width/2,y,z-.007),(x+width/2,y,z-.007),(x+width/2,y,z+.007),(x-width/2,y,z+.007)])
    fs=[(3,2,1,0),tuple(range((len(points)-1)*4,len(points)*4))]
    for i in range(len(points)-1):
        for j in range(4):a=i*4+j;b=i*4+(j+1)%4;fs.append((a,b,b+4,a+4))
    o=mesh(name,vs,fs,material,None);o['torsoOnly']=True;return o


def make_pack():
    r,d=asset('acc-tideglass-twinfin','Tideglass twin-fin pack','accessory','Compact central glazed shell pod with short swept side fins, closed wide shoulder straps and coral clasp. No tanks or weapons.')
    d['tags']=['back-mounted'];objects=[]
    # Front of pod at -.198, close to the shell back at -.181. Chest-mounted
    # strapping stays between shoulders and does not cross swinging arms.
    pod=bake(box('Compact reef pod',(0,1.332,-.273),(.227,.310,.142),secondary,None,.030));objects.append(pod)
    for sign in [-1,1]:objects.append(bake(box('Soft back mounting pad '+str(sign),(sign*.061,1.34,-.173),(.090,.238,.118),secondary,None,.007)))
    rear=shield('Glazed pod shield',[(-.076,1.475,-.322),(.076,1.475,-.322),(.108,1.412,-.330),(.080,1.220,-.326),(0,1.183,-.323),(-.080,1.220,-.326),(-.108,1.412,-.330)],(0,1.332,-.373),trim,-.010);objects.append(rear)
    rear.data.materials.append(primary)
    for p in rear.data.polygons:
        if p.index in [1,2,4,5]:p.material_index=1
    for s in [-1,1]:
        fin=shield('Short swept pack fin '+str(s),[(s*.108,1.255,-.292),(s*.161,1.227,-.265),(s*.174,1.405,-.263),(s*.151,1.535,-.268),(s*.127,1.483,-.292)],(s*.158,1.391,-.332),primary,-.013);objects.append(fin)
        objects.append(strap('Closed shoulder webbing '+str(s),[(s*.076,1.455,-.203),(s*.115,1.496,-.137),(s*.149,1.528,-.064),(s*.153,1.525,.013),(s*.149,1.480,.087),(s*.153,1.418,.129),(s*.154,1.336,.133),(s*.151,1.252,.128),(s*.149,1.186,.127),(s*.169,1.155,.072),(s*.171,1.187,-.075),(s*.103,1.240,-.203)],.027,secondary))
        objects.append(bake(box('Coral strap buckle '+str(s),(s*.153,1.415,.140),(.037,.051,.018),accent,None,.005)))
    objects.append(prism('Central coral pod clasp',[(-.019,1.381,-.379),(.019,1.381,-.379),(.016,1.323,-.383),(0,1.305,-.383),(-.016,1.323,-.383)],accent,-.009))
    for o in objects:o['torsoOnly']=True
    finish_piece(r,d,objects,'shirt')

make_hat();make_shirt();make_pants();make_shoes();make_pack()
# Keep every part visible in source for editing, with shared rig coordinates.
for root in roots:
    for o in [root]+list(root.children_recursive):o.hide_render=False;o['tideglassOriginal']=True
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/tideglass-explorer.blend'),compress=True)
print('TIDEGLASS_TOTAL',sum(a['triangles']for a in assets),sum(a['bytes']for a in assets),flush=True)
