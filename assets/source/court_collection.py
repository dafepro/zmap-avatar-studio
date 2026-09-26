"""Court collection: run in interactive Blender with __file__ set to this path.

Uses the established rig and connected garment topology. Only this dedicated
scene is replaced on a rebuild; other scenes and exported assets are preserved.
Reference sheets and construction decisions: docs/references/court-collection.
"""
import ast
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
scene = bpy.data.scenes.get('Zoomap · court collection')
if scene is None:
    scene = bpy.data.scenes.new('Zoomap · court collection')
else:
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.context.window.scene = scene
exec(compile((ROOT/'assets/source/kit_io.py').read_text(), 'kit_io.py', 'exec'), globals())
source = (ROOT/'assets/source/reference_kit.py').read_text()
# Reuse definitions, never execute the kit's scene reset or asset-generation calls.
start = source.index('for channel in channels:')
end = source.index('\ndef make_body():')
exec(compile(source[start:end], 'reference-rig-and-topology', 'exec'), globals())
for node in ast.parse(source).body:
    if isinstance(node, ast.FunctionDef) and node.name == 'make_bottom':
        bottom_source = ast.get_source_segment(source, node)

cream = mat('Court cream', '#eee4cb')
gold = mat('Match gold', '#dcae52')
charcoal = mat('Court charcoal', '#283539')
teal = mat('Court teal', '#337f7d')
burgundy = mat('Match burgundy', '#782e43')

def shirt(style):
    global primary
    is_court = style == 'courtside'
    primary=mat(style+' primary','#337f7d' if is_court else '#782e43');primary['paletteChannel']='primary'
    r,d = asset('shirt-'+style, 'Courtside zip top' if is_court else 'Matchday sash jersey', 'shirt',
                'Reference-authored connected jersey with bound sleeves and a standing zip collar.' if is_court else
                'Reference-authored V-neck jersey with a continuous gold sash cut into the cloth topology.')
    d['covers'] = ['torso']
    obj = torso_surface('Continuous V-neck jersey · '+style, True)
    obj.data.materials[1] = cream if is_court else gold
    obj.data.materials.append(cream)
    objects = [obj]
    if is_court:
        for j in range(16):
            v=obj.data.vertices[80+j];a=j*math.tau/16
            v.co.z += .117*max(0,1-abs(v.co.x)/.15)*max(0,math.cos(a))
        for row in [6,7]:
            for j in range(16):
                v=obj.data.vertices[row*16+j];a=j*math.tau/16
                v.co.z += .085*max(0,math.cos(a))**1.6 + (row-6)*.027
                v.co.y *= .70
        for poly in obj.data.polygons:
            center=sum((obj.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
            if 1.42 < center.z < 1.526: poly.material_index=2
        obj.data.materials.append(charcoal)
        for poly in obj.data.polygons:
            if max(poly.vertices)<32:poly.material_index=3
        # Two tapes follow the actual front surface instead of floating over it.
        for sign in [-1,1]:
            path=[(1.562,.077),(1.494,.114),(1.355,.123),(1.29,.122),(1.15,.121),(1.05,.129),(1.003,.131)]
            vs=[(sign*.006+dx,y,z) for y,z in path for dx in [-.0023,.0023]]
            objects.append(mesh('Cream zip tape',vs,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(6)],cream,None))
        objects.append(box('Zip pull',(0,1.49,.121),(.009,.021,.005),charcoal,None,0))
    else:
        for poly in obj.data.polygons:
            if min(poly.vertices)>=96 and max(poly.vertices)<128:poly.material_index=2
        # Cutting the continuous mesh creates a true fabric panel with no hovering
        # decal or z-fighting. Both sides meet at the same height at the side seam.
        bm=bmesh.new();bm.from_mesh(obj.data)
        for height in [1.255,1.335]:
            bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                dist=.000001,plane_co=(0,0,height),plane_no=(-.85,0,1))
        bm.to_mesh(obj.data);bm.free()
        obj.data.materials.append(gold)
        for poly in obj.data.polygons:
            center=sum((obj.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
            if 1.255 < center.z-.85*center.x < 1.335:poly.material_index=3
    bind(r,d,objects,'shirt');export(r,d)

def shorts(style):
    global secondary
    # The original connected crotch and hip weighting remain intact. Length,
    # side panels, hems and colors are separately authored for each concept.
    is_court=style=='courtside'
    secondary=mat(style+' shorts cloth','#283539' if is_court else '#782e43')
    code=bottom_source.replace("end=.714 if long else .767", "end=.655 if long else .735")
    code=code.replace("objects.append(crown('Shorts crown',.120,end+.026,.102,.027,trim))", "")
    code=code.replace('n=24,cap=False','n=12,cap=False').replace('.0065,trim,n=6','.0065,trim,n=4')
    code=code.replace("bind(r,d,objects,'bottom');export(r,d)", "decorate_bottom(objects, end, long);bind(r,d,objects,'bottom');export(r,d)")
    scope=dict(globals());exec(compile(code,'connected-court-shorts','exec'),scope)
    scope['make_bottom']('bottom-'+style,'Courtside long shorts' if is_court else 'Matchday vent shorts',is_court)

def decorate_bottom(objects,end,is_court):
    obj=objects[0];obj.data.materials.append(teal if is_court else cream)
    for v in obj.data.vertices:
        if v.co.z<.96:
            t=min(1,(.96-v.co.z)/(.96-end))
            v.co.x += math.copysign(.022*t*min(1,abs(v.co.x)/.12),v.co.x)
            v.co.y *= 1+.07*t
    for poly in obj.data.polygons:
        center=sum((obj.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices)
        if abs(center.x)>.16 and (not is_court or center.z<.95):poly.material_index=1
    for sign in [-1,1]:
        # Open leg cuff, bent outer split, no disks capping the leg opening.
        path=[(sign*x,end+(0.018 if x>.19 and not is_court else 0),z)
              for x,z in [( .030,0),(.079,.110),(.150,.135),(.200,.098),(.235,0),
                          (.200,-.098),(.150,-.135),(.079,-.110),(.030,0)]]
        objects.append(tube('Bound open hem',path,.005,cream if is_court else gold,n=3))

def visor():
    r,d=asset('hat-courtside-visor','Courtside open visor','headwear','Open crown sports visor with a curved bill and cream edge; one source shared by all hair.')
    p=mount(r,d,'head')
    band=rings('Open visor band',[(.087,.246,.228,-.013),(.126,.247,.229,-.013)],teal,p,24)
    # Remove top and bottom caps: this is a band, not a lid over the hair.
    bm=bmesh.new();bm.from_mesh(band.data)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if len(f.verts)>4],context='FACES')
    bm.to_mesh(band.data);bm.free()
    vs=[]
    for depth in [0,1]:
        for i in range(17):
            a=-1.15+2.3*i/16
            vs.append((math.sin(a)*(.247+.025*depth),.094-.026*depth-.015*abs(math.sin(a)),
                       math.cos(a)*(.229+.133*depth)-.013))
    bill=mesh('Curved visor bill',vs,[(i,i+1,i+18,i+17) for i in range(16)],teal,p)
    bpy.context.view_layer.objects.active=bill
    mod=bill.modifiers.new('Bill thickness','SOLIDIFY');mod.thickness=.006
    bpy.ops.object.modifier_apply(modifier=mod.name)
    tube('Cream brim edge',vs[17:],.0035,cream,p,n=4)
    d['hairFit']=[{'targetSlot':'hair','mode':'occlude'}]
    export(r,d)

def glasses():
    r,d=asset('acc-matchday-sport','Matchday sports glasses','eyewear','Slim rounded rectangular charcoal rims, amber lenses and gold temples fitted to the actual face.')
    p=mount(r,d,'head');lens=mat('Smoky amber lens','#77552b')
    lens.diffuse_color=(*lens.diffuse_color[:3],.38)
    lens.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value=.38
    lens.surface_render_method='DITHERED'
    for cx in [-.093,.093]:
        points=[]
        for x,y,a in [(.047,.027,0),(-.047,.027,90),(-.047,-.027,180),(.047,-.027,270)]:
            for j in range(4):
                angle=math.radians(a+j*30)
                points.append((cx+x+math.cos(angle)*.015,.021+y+math.sin(angle)*.015,.236))
        rim=tube('Sport rim',points+[points[0]],.0045,charcoal,p,n=5);rim['fitRole']='front'
        pane=mesh('Amber lens',points,[tuple(range(len(points)))],lens,p);pane['fitRole']='front'
    bridge=tube('Sport bridge',[(-.030,.025,.234),(0,.033,.239),(.030,.025,.234)],.004,charcoal,p,n=5);bridge['fitRole']='front'
    for sign in [-1,1]:
        temple=tube('Sport temple',[(sign*.155,.027,.236),(sign*.210,.026,.196),(sign*.241,.016,.045),(sign*.237,-.023,-.06)],.005,charcoal,p,n=5);temple['fitRole']='side'
        stripe=tube('Gold temple accent',[(sign*.216,.028,.180),(sign*.230,.024,.115)],.0055,gold,p,n=4);stripe['fitRole']='side'
    d['fit']={'targetSlot':'head','surface':'face-v2','frame':[0,-.041,.326,.318],'mode':'clearance','offset':.016,'maxDistance':.085,'projection':'wrap','sideOffset':.003}
    for obj in p.children:
        if obj.type=='MESH' and obj.get('fitRole')=='front':
            for v in obj.data.vertices:v.co.y+=.4*v.co.x*v.co.x
    d['hairFit']=[{'targetSlot':'hair','mode':'occlude'}];export(r,d)

for style in ['courtside','matchday']:
    shirt(style);shorts(style)
visor();glasses()
catalog=json.loads((ROOT/'public/catalog.json').read_text())
ids={a['id'] for a in assets}
catalog['assets']=[a for a in catalog['assets'] if a['id'] not in ids]+assets
catalog['revision']='2.6.0'
if '2.5.0' not in catalog['compatibleRecipeRevisions']:catalog['compatibleRecipeRevisions'].append('2.5.0')
(ROOT/'public/catalog.json').write_text(json.dumps(catalog,indent=2)+'\n')
# Keep just this collection editable in a portable source .blend library.
bpy.data.libraries.write(str(ROOT/'assets/source/court-collection.blend'),{scene},fake_user=True)
result={'assets':[{k:a[k] for k in ['id','triangles','bytes']} for a in assets], 'scene':scene.name}
