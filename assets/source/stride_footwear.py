"""Build the original Stride footwear in an isolated authoring scene.

blender -b --python assets/source/stride_footwear.py
Uses the established GLB exporter, exact catalog bind pose and footwear field.
Writes only this piece's GLB, descriptor, editable scene and source audit.
Concept and exact generation prompt live under docs/references/stride/.
"""
import ast
import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
ID = 'shoes-stride'
if bpy.context.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
scene = bpy.data.scenes.get('Stride · original articulated footwear')
if scene is None:
    scene = bpy.data.scenes.new('Stride · original articulated footwear')
bpy.context.window.scene = scene
for obj in list(scene.objects):
    if obj.get('strideSource'):
        bpy.data.objects.remove(obj, do_unlink=True)
before = set(bpy.data.objects)
exec(compile((ROOT/'assets/source/kit_io.py').read_text(), 'kit_io.py', 'exec'), globals())
catalog = json.loads((ROOT/'public/catalog.json').read_text())
sockets = catalog['rig']['sockets']
positions = {}
for socket in sockets:
    positions[socket['id']] = Vector(socket['position']) + (positions[socket['parent']] if socket['parent'] else Vector())
old_asset = asset
module = ast.parse((ROOT/'assets/source/reference_kit.py').read_text())
for node in module.body:
    if isinstance(node, ast.FunctionDef) and node.name in {'asset', 'mount', 'color', 'ease', 'thigh_weights', 'section', 'tube', 'bind'}:
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'reference_kit.py', 'exec'), globals())
for channel in channels:
    globals()[channel]['paletteChannel'] = channel
for material, hex_color in [(primary, '#df693b'), (secondary, '#32283f'), (trim, '#f2e4c5'), (accent, '#c6ea4c')]:
    color(material, hex_color)
OUT = ROOT/'public/capsule/models'
OUT.mkdir(parents=True, exist_ok=True)
assets = []
roots = []


def prism(name, outline, bottom, top, material, side, bevel=.0):
    """Longitudinal clipped polygon, with an intentionally broad chamfer."""
    x0, y0, z0 = positions['foot_'+side]
    center = sum((Vector(p) for p in outline), Vector((0, 0)))/len(outline)
    verts = []
    levels = [(bottom, .90), (bottom+bevel, 1), (top-bevel, 1), (top, .89)] if bevel else [(bottom, 1), (top, 1)]
    for y, scale in levels:
        verts += [(x0+center.x+(x-center.x)*scale, y0+y, z0+center.y+(z-center.y)*scale) for x, z in outline]
    n = len(outline)
    faces = [tuple(reversed(range(n))), tuple(range((len(levels)-1)*n, len(levels)*n))]
    for row in range(len(levels)-1):
        faces += [(row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i) for i in range(n)]
    return mesh(name, verts, faces, material, None)


def ribbon(name, points, width, thickness, material, side):
    """Closed flat webbing following a 3D path, not a round cable."""
    origin = positions['foot_'+side]
    verts = []
    # Path width follows the shoe's length axis. For these cage/strap planes
    # it is independent of the path tangent, producing broad readable bands.
    for x, y, z in points:
        verts += [tuple(origin+Vector((x,y+dy,z+dz))) for dy,dz in [(-thickness/2,-width/2),(-thickness/2,width/2),(thickness/2,width/2),(thickness/2,-width/2)]]
    faces = [(3,2,1,0),tuple(range((len(points)-1)*4,len(points)*4))]
    for row in range(len(points)-1):
        faces += [(row*4+i,row*4+(i+1)%4,(row+1)*4+(i+1)%4,(row+1)*4+i) for i in range(4)]
    return mesh(name, verts, faces, material, None)


def cage_band(name, points, width, depth, material, side):
    """Closed broad strip in side-view plane; four vertices per bend."""
    origin = positions['foot_'+side]
    verts = []
    for i, point in enumerate(points):
        p = Vector(point)
        tangent = Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        normal = Vector((0,-tangent.z,tangent.y)).normalized()*width/2
        for sx, sn in [(-1,-1),(1,-1),(1,1),(-1,1)]:
            verts.append(tuple(origin+p+Vector((sx*depth/2,0,0))+sn*normal))
    faces = [(3,2,1,0),tuple(range((len(points)-1)*4,len(points)*4))]
    for row in range(len(points)-1):
        faces += [(row*4+i,row*4+(i+1)%4,(row+1)*4+(i+1)%4,(row+1)*4+i) for i in range(4)]
    return mesh(name,verts,faces,material,None)


root, record = asset(ID, 'Stride split-sole', 'shoes', 'Original angular street-sport sneaker: separated heel/forefoot blocks, narrow bridge, broad offset strap, open geometric heel cage, clipped toe and shin-bound crew sock.')
record['covers'] = ['feet']
objects = []
component_audit = []
for side in ['L', 'R']:
    sign = -1 if side == 'L' else 1
    origin = positions['foot_'+side]
    start = len(objects)
    # Floor is world Y=.001. The missing midsole volume is a true arch gap.
    fore = [(-.079,.040),(.079,.040),(.098,.086),(.097,.173),(.064,.230),(-.064,.230),(-.097,.173),(-.098,.086)]
    heel = [(-.078,-.022),(.078,-.022),(.087,-.065),(.062,-.112),(-.062,-.112),(-.087,-.065)]
    objects += [prism('Forefoot tread '+side,fore,-.119,-.098,secondary,side,.005),
                prism('Heel tread '+side,heel,-.119,-.098,secondary,side,.005),
                prism('Forefoot split pod '+side,fore,-.103,-.039,trim,side,.014),
                prism('Heel split pod '+side,heel,-.103,-.027,trim,side,.015),
                prism('Narrow raised waist '+side,[(-.034,-.040),(.034,-.040),(.039,.072),(-.039,.072)],-.066,-.042,secondary,side,.004)]
    # Six-plane upper shell; the rear top is open for the anatomically bound sock.
    rows = [(-.097,.045,.033),(-.060,.067,.087),(-.010,.072,.110),(.053,.083,.098),(.116,.087,.033),(.192,.067,-.006),(.221,.047,-.019)]
    verts = []
    for z, width, top in rows:
        verts += [tuple(origin+Vector((x,y,z))) for x,y in [(-width,-.039),(-width,top-.032),(-width*.59,top),(width*.59,top),(width,top-.032),(width,-.039)]]
    faces = []
    for row in range(len(rows)-1):
        for j in range(6):
            if row < 2 and j == 2: continue
            faces.append((row*6+j,row*6+(j+1)%6,(row+1)*6+(j+1)%6,(row+1)*6+j))
    faces += [tuple(reversed(range(6))),tuple(range((len(rows)-1)*6,len(rows)*6))]
    objects.append(mesh('Clipped six-plane upper '+side,verts,faces,primary,None))
    objects.append(mesh('Raised angular tongue '+side,[tuple(origin+Vector(p)) for p in [(-.030,.042,.123),(.030,.042,.123),(.034,.137,.021),(.024,.157,.009),(-.024,.157,.009),(-.034,.137,.021)]],[(0,1,2,3,4,5)],primary,None))
    # Broad asymmetric bridge strap deliberately meets the outer cage lower
    # and further back than its inner attachment.
    objects.append(ribbon('Offset instep bridge '+side,[(sign*-.077,.052,.085),(sign*-.048,.114,.072),(sign*.017,.123,.050),(sign*.073,.076,.008)],.053,.012,secondary,side))
    objects.append(cage_band('Outer strap buckle '+side,[(sign*.079,.045,.010),(sign*.079,.076,.022)],.024,.013,accent,side))
    # Two open quadrilateral heel frames and diagonal reinforcement are actual
    # negative spaces. Nothing projects into the neutral calf volume.
    for flank in [-1,1]:
        x=flank*.079
        objects.append(cage_band('Open heel frame '+side+str(flank),[(x,-.015,-.068),(x,.056,-.100),(x,.125,-.054),(x,.063,.014),(x,-.015,-.068)],.020,.012,secondary,side))
        objects.append(cage_band('Heel cage crossbar '+side+str(flank),[(x,.027,-.086),(x,.066,-.001)],.015,.012,secondary,side))
    objects.append(ribbon('Rear heel bridge '+side,[(-.077,.052,-.097),(0,.072,-.108),(.077,.052,-.097)],.021,.017,secondary,side))
    objects.append(ribbon('Heel pull loop '+side,[(-.019,.074,-.101),(-.015,.159,-.081),(.015,.159,-.081),(.019,.074,-.101)],.015,.008,secondary,side))
    objects.append(ribbon('Heel pull signal '+side,[(-.009,.102,-.091),(-.007,.151,-.083),(.007,.151,-.083)],.010,.009,accent,side))
    # Midsole contrast inserts sharpen the tread profile without texture maps.
    for flank in [-1,1]:
        objects.append(cage_band('Forefoot pod inset '+side+str(flank),[(flank*.098,-.080,.096),(flank*.098,-.060,.125),(flank*.098,-.060,.167)],.014,.003,secondary,side))
    # Crew sock follows exactly the anatomical shin/foot transition. More than
    # one intermediate row gives the ankle blend enough rest-space sampling.
    sock_rows = [(.107,origin.x,.006,.043,.049),(.143,origin.x-sign*.003,-.002,.044,.050),(.184,origin.x-sign*.007,-.006,.047,.051),(.255,origin.x-sign*.015,-.010,.052,.053),(.345,origin.x-sign*.026,-.011,.065,.062),(.379,origin.x-sign*.030,-.011,.069,.066)]
    sock = section('Shin-bound crew sock '+side,sock_rows,trim,n=12,cap=False)
    sock['ankle_fabric'] = True
    objects.append(sock)
    cuff = section('Double rib cuff '+side,[(.358,origin.x-sign*.028,-.011,.068,.065),(.378,origin.x-sign*.030,-.011,.071,.068)],trim,n=12,cap=False)
    cuff['ankle_fabric'] = True
    objects.append(cuff)
    for j in range(6):
        angle = j*math.tau/6
        rib = tube('Raised knit rib '+side+str(j),[(x+math.sin(angle)*(rx+.001),y,z+math.cos(angle)*(rz+.001)) for y,x,z,rx,rz in sock_rows[2:]],.0011,trim,n=3)
        rib['ankle_fabric'] = True
        objects.append(rib)
    for obj in objects[start:]:
        obj['family'] = 'footwear'
        component_audit.append({'name':obj.name,'side':side,'binding':'shared ankle fabric' if obj.get('ankle_fabric') else 'rigid foot','sourceVertices':len(obj.data.vertices)})

bind(root,record,objects,'footwear')
export(root,record)
descriptor = ROOT/'public/capsule/parts/shoes-stride.json'
descriptor.parent.mkdir(parents=True, exist_ok=True)
descriptor.write_text(json.dumps(record,indent=2)+'\n')
for obj in set(bpy.data.objects)-before:
    obj['strideSource'] = True
for obj in [root]+list(root.children_recursive):
    obj.hide_render = False
scene['sourceDescription'] = 'Original Stride geometry, editable meshes and exact athlete-reference-v2 skin; concept is inspiration, not baked imagery.'
scene['conceptPath'] = 'docs/references/stride/concept.png'
bpy.data.libraries.write(str(ROOT/'assets/source/stride-footwear.blend'),{scene},fake_user=True,compress=True)
audit = {'id':ID,'rig':record['rig'],'triangles':record['triangles'],'bytes':record['bytes'],'sha256':record['sha256'],'components':component_audit,'ankleTransitionWorldY':[.105,.19],'originalGeometry':True}
(ROOT/'docs/evidence/stride/source-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print('STRIDE_READY',json.dumps({key:record[key] for key in ['id','triangles','bytes','sha256']}),flush=True)
