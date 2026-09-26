"""Three original playful wearables, authored from actual-avatar image studies.

Run in interactive Blender with __file__ set to this path. Rebuilds only the
named scene and three additive exports. Existing kit/court assets are untouched.
"""
import bpy, bmesh, math, json
from pathlib import Path
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parents[2]
scene=bpy.data.scenes.get('Zoomap · playtime collection')
if scene is None:scene=bpy.data.scenes.new('Zoomap · playtime collection')
else:
    for obj in list(scene.objects):bpy.data.objects.remove(obj,do_unlink=True)
bpy.context.window.scene=scene
exec(compile((ROOT/'assets/source/kit_io.py').read_text(),'kit_io.py','exec'),globals())
source=(ROOT/'assets/source/reference_kit.py').read_text()
exec(compile(source[source.index('for channel in channels:'):source.index('\ndef make_body():')],'reference-rig-and-topology','exec'),globals())
leaf=mat('Frog leaf','#7caa48');forest=mat('Frog band','#28543d')
cream=mat('Frog cream','#eee8ca');black=mat('Seed and pupil','#24242a')
yellow=mat('Electric yellow','#f5d934');blue=mat('Cobalt temples','#2850a5')
coral=mat('Melon flesh','#ed635f');mint=mat('Melon rind','#b2dfb2')

def frog():
    r,d=asset('hat-frog-days','Frog Days bucket hat','headwear','Leaf-green bucket hat with raised frog eyes, cream brim edge, forest band and stitched smile.')
    p=mount(r,d,'head')
    # Continuous open wearing edge, brim, band and roof outside the proven
    # hair-containment ellipsoid. No hidden bottom disk cuts through hair.
    profile=[(.125,.238,.231),(.102,.329,.310),(.117,.332,.313),
             (.165,.266,.253),(.213,.248,.235),(.242,.239,.227),
             (.327,.208,.196),(.354,.145,.137),(.363,.015,.015)]
    n=16;vs=[(math.sin(i*math.tau/n)*rx,y,math.cos(i*math.tau/n)*rz-.0096)
             for y,rx,rz in profile for i in range(n)]
    fs=[]
    for row in range(len(profile)-1):
        for i in range(n):a=row*n+i;b=row*n+(i+1)%n;fs.append((a,b,b+n,a+n))
    fs.append(tuple(range((len(profile)-1)*n,len(vs))))
    shell=mesh('Open bucket brim and crown',vs,fs,leaf,p)
    shell.data.materials.append(cream);shell.data.materials.append(forest)
    for poly in shell.data.polygons:
        row=poly.index//n
        if row==1:poly.material_index=1
        if row==4:poly.material_index=2
    for x in [-.127,.127]:
        ico('Raised frog eye',(x,.350,.118),(.067,.068,.057),leaf,p,1)
        ellipse('Cream frog eye',(x,.353,.171),.044,.046,cream,p,n=10)
        ellipse('Black frog pupil',(x,.353,.1725),.024,.027,black,p,n=8)
        ellipse('Eye glint',(x-.008,.363,.174),.007,.008,white,p,n=5)
    tube('Stitched frog smile',[(-.052,.294,.196),(-.034,.281,.205),(0,.276,.211),(.034,.281,.205),(.052,.294,.196)],.003,forest,p,n=4)
    d['hairFit']=[{'targetSlot':'hair','mode':'contain','center':[0,.1125,-.0096],
                   'radii':[.2097144,.1908,.2024],'transition':[-.054,.0675]}]
    d['tags']=['playtime-collection'];export(r,d)

def extrude_shape(name,outline,z,depth,material,parent):
    n=len(outline);vs=[(x,y,z+offset) for offset in [-depth/2,depth/2] for x,y in outline]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,vs,fs,material,parent)

def bolt():
    r,d=asset('acc-bolt-mode','Bolt Mode frames','eyewear','Open electric-yellow frames with compact lightning corners and cobalt-blue wrapped temples.')
    p=mount(r,d,'head')
    for sign in [-1,1]:
        # Rims have real eye openings and a beveled rectangular contour.
        outline=[(.034,-.018),(.046,-.030),(.138,-.030),(.148,-.016),(.148,.055),(.038,.055)]
        rim=tube('Open bolt rim',[(sign*x,y,.236) for x,y in outline+[outline[0]]],.007,yellow,p,n=4);rim['fitRole']='front'
        # Shallow extruded zigzag, close to the rim; keep cheek-side points
        # within the tested face-clearance region rather than giant side wings.
        shape=[(.143,.054),(.159,.060),(.150,.025),(.171,.033),(.138,-.061),(.148,-.010),(.130,-.011)]
        flash=extrude_shape('Lightning corner',[(sign*x,y) for x,y in shape],.237,.007,yellow,p);flash['fitRole']='front'
    bridge=tube('Bolt bridge',[(-.033,.029,.234),(0,.032,.239),(.033,.029,.234)],.004,yellow,p,n=4);bridge['fitRole']='front'
    for sign in [-1,1]:
        stem=tube('Cobalt temple',[(sign*.143,.050,.229),(sign*.211,.050,.178),(sign*.239,.035,.016),(sign*.233,-.025,-.065)],.007,blue,p,n=4);stem['fitRole']='side'
        tip=tube('Yellow temple tip',[(sign*.237,.003,-.033),(sign*.233,-.025,-.065)],.008,yellow,p,n=4);tip['fitRole']='side'
    for obj in p.children:
        if obj.type=='MESH' and obj.get('fitRole')=='front':
            for v in obj.data.vertices:
                v.co.x*=.9
                v.co.y+=.4*v.co.x*v.co.x
    d['fit']={'targetSlot':'head','surface':'face-v2','frame':[0,-.041,.326,.318],
              'mode':'clearance','offset':.016,'maxDistance':.085,'projection':'wrap','sideOffset':.003}
    d['hairFit']=[{'targetSlot':'hair','mode':'occlude'}];d['tags']=['playtime-collection'];export(r,d)

def melon():
    r,d=asset('shirt-melon-club','Melon Club jersey','shirt','Coral watermelon jersey with five front seeds, four back seeds, green bindings and a pale rind stripe.')
    d['covers']=['torso'];d['tags']=['playtime-collection']
    obj=torso_surface('Continuous V-neck jersey · Melon Club',True)
    obj.data.materials[0]=coral;obj.data.materials[1]=forest;obj.data.materials.append(mint)
    # The broad green hem is the existing connected first cloth row. One cut
    # creates the mint rind stripe without adding a second hovering shell.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                           dist=.000001,plane_co=(0,0,1.076),plane_no=(0,0,1))
    bm.to_mesh(obj.data);bm.free()
    for poly in obj.data.polygons:
        cy=sum(obj.data.vertices[i].co.z for i in poly.vertices)/len(poly.vertices)
        if cy<1.05:poly.material_index=1
        elif cy<1.076:poly.material_index=2
    # Project each flat seed onto the actual garment triangles before skinning.
    tree=BVHTree.FromPolygons([v.co for v in obj.data.vertices],[list(p.vertices) for p in obj.data.polygons],all_triangles=False)
    objects=[obj]
    for front,locations in [(1,[(-.088,1.385),(.088,1.385),(0,1.28),(-.09,1.18),(.09,1.18)]),
                            (-1,[(-.085,1.39),(.085,1.39),(-.088,1.22),(.088,1.22)])]:
        for x,y in locations:
            points=[]
            for dx,dy in [(0,.023),(-.011,-.003),(-.008,-.014),(.008,-.014),(.011,-.003)]:
                dx*=1.4;dy*=1.35
                hit=tree.ray_cast(Vector((x+dx,-front,y+dy)),Vector((0,front,0)),2)[0]
                if hit is None:raise RuntimeError('Seed missed garment surface')
                points.append((x+dx,y+dy,-hit.y+front*.0015))
            objects.append(mesh('Watermelon seed',points,[tuple(range(5))],black,None))
    bind(r,d,objects,'shirt');export(r,d)

frog();bolt();melon()
catalog=json.loads((ROOT/'public/catalog.json').read_text())
ids={a['id'] for a in assets}
catalog['assets']=[a for a in catalog['assets'] if a['id'] not in ids]+assets
catalog['revision']='2.7.0'
if '2.6.0' not in catalog['compatibleRecipeRevisions']:catalog['compatibleRecipeRevisions'].append('2.6.0')
(ROOT/'public/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
bpy.data.libraries.write(str(ROOT/'assets/source/playtime-collection.blend'),{scene},fake_user=True)
result={'assets':[{k:a[k] for k in ['id','triangles','bytes']} for a in assets],'scene':scene.name}
