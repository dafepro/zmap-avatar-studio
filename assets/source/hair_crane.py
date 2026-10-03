"""CRANE: original chisel sweep, close undercut, compact chevron nape braid.

Run: blender -b --python assets/source/hair_crane.py
Uses the qualified scalp unchanged. Exports only its own capsule GLB and upserts
its descriptor, preserving every other part. The editable scene is saved before
export consolidation. No hairstyle/head/hat-specific variant or fit override.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
ref=(ROOT/'assets/source/reference_kit.py').read_text()
exec(compile(ref.split('\nmake_body()\n')[0], 'reference_kit_helpers', 'exec'), globals())
CAPSULE=ROOT/'public/capsule';CAPSULE.mkdir(parents=True,exist_ok=True)
OUT=CAPSULE/'models';OUT.mkdir(parents=True,exist_ok=True)
assets=[];roots=[]
color(hair,'#3e5559')


def pigment(obj,shades):
    layer=obj.data.color_attributes.new(name='Hair pigment',type='FLOAT_COLOR',domain='CORNER')
    for p in obj.data.polygons:
        shade=shades[p.index%len(shades)]
        for i in p.loop_indices:layer.data[i].color=(shade,shade,shade,1)


def sweep(parent,name,points,width,depth,back=False):
    """Closed bevelled solid with a chisel ridge. Pigment is vertex topology.

    The eight station cross-sections curve as a volume rather than floating
    ribbons; the broad middle is buried into the fitted foundation.
    """
    cp=[Vector(p)for p in points];vs=[];fs=[];values=[]
    steps=[0,.14,.29,.45,.61,.76,.9,1]
    section=[(-1,0),(-.72,.55),(-.20,1),(.55,.78),(1,0),(.55,-.7),(-.45,-.8)]
    for t in steps:
        u=1-t;c=cp[0]*u**3+cp[1]*3*u*u*t+cp[2]*3*u*t*t+cp[3]*t**3
        tangent=((cp[1]-cp[0])*3*u*u+(cp[2]-cp[1])*6*u*t+(cp[3]-cp[2])*3*t*t).normalized()
        outward=Vector((c.x*.55,(c.y+.045)*1.6,c.z*.6))
        if back:outward=Vector((c.x*.4,.13,-1))
        normal=(outward-tangent*outward.dot(tangent)).normalized();across=tangent.cross(normal).normalized()
        fullness=math.sin(math.pi*t)**.55
        w=width*fullness+.010*u+.0008*t;h=depth*fullness+.006*u+.0005*t
        for j,(a,b)in enumerate(section):
            vs.append(tuple(c+across*a*w+normal*b*h));values.append([.51,.76,1,.88,.60,.39,.43][j])
    n=len(section)
    for row in range(len(steps)-1):
        for j in range(n):
            a=row*n+j;b=row*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs += [tuple(reversed(range(n))),tuple(range((len(steps)-1)*n,len(steps)*n))]
    o=mesh(name,vs,fs,hair,parent)
    # Flat broad cross-section planes, lightly smoothed along each curve.
    for p in o.data.polygons:p.use_smooth=True
    layer=o.data.color_attributes.new(name='Hair pigment',type='FLOAT_COLOR',domain='CORNER')
    for l in o.data.loops:
        q=values[l.vertex_index];layer.data[l.index].color=(q,q,q,1)
    return o


def braid_link(parent,index,y,z,scale):
    """Interleaved folded links, closed front/back with actual bevel planes."""
    # Contrasting left/right planes show the braid without a strand texture.
    w=.046*scale;h=.047*scale;d=.032*scale
    points=[(-w,y+h*.8,z),(0,y+h*.27,z-d), (w,y+h*.8,z),
            (w*.74,y-h*.22,z-d*.35),(0,y-h,z-d*.15),(-w*.74,y-h*.22,z-d*.35),
            (0,y+h*.9,z+d*.43),(0,y-h*.7,z+d*.4)]
    faces=[(0,1,4,5),(1,2,3,4),(0,6,2,1),(5,4,7),(4,3,7),(0,5,7,6),(6,7,3,2)]
    o=mesh('Crane · folded braid link %d'%index,points,faces,hair,parent)
    pigment(o,[.75,.98,.53,.44,.70,.35,.42]);return o


r,d=asset('hair-crane','Crane undercut braid','hair','Original compact asymmetric chisel sweep over a close undercut, with a short three-link folded nape braid. Shared scalp foundation and accessory-owned fitting; one source mesh.')
d['tags']=['studio-capsule','original-crane']
p=mount(r,d,'head')
foundation=scalp_foundation(p,'Crane',nape=-.115,undercut=True,root_pigment=.28,
    frontal_hairline=[(0,.119),(.4,.125),(.85,.111),(1.25,.018)])
# The close mantle closes all visible spaces between main locks, while keeping
# the intentionally cropped sides legible. It never changes the fit foundation.
crown=smooth(rings('Crane · continuous low crown',[(.106,.160,.162,-.009),(.158,.178,.179,-.015),(.213,.141,.147,-.022),(.251,.073,.092,-.034),(.258,.006,.008,-.034)],hair,p,n=24))
pigment(crown,[.63])
paths=[
    ([(.119,.135,.147),(.063,.207,.215),(-.122,.206,.213),(-.195,.032,.129)],.047,.026),
    ([(.150,.140,.067),(.090,.262,.147),(-.106,.263,.123),(-.229,.114,.071)],.066,.027),
    ([(.153,.131,-.024),(.097,.274,.030),(-.090,.286,-.005),(-.224,.149,-.064)],.069,.029),
    ([(.119,.113,-.109),(.061,.226,-.134),(-.094,.232,-.152),(-.178,.089,-.162)],.060,.024),
]
for i,(pts,w,h)in enumerate(paths):sweep(p,'Crane · diagonal chisel lock %d'%(i+1),pts,w,h)
# Short counter-flow at the right part prevents a symmetric bowl silhouette.
sweep(p,'Crane · right part return',[(.114,.171,.115),(.165,.183,.081),(.177,.125,.029),(.185,.038,.021)],.030,.018)
for sign in [-1,1]:
    sweep(p,'Crane · rear gather '+str(sign),[(sign*.115,.140,-.152),(sign*.093,.095,-.218),(sign*.044,.025,-.225),(0,-.035,-.195)],.041,.018,True)
for i,(y,z,scale)in enumerate([(-.036,-.205,1),(-.101,-.196,.91),(-.159,-.177,.78)],1):braid_link(p,i,y,z,scale)
# Small hair-channel binding, deliberately no extra color dependency.
band=rings('Crane · braid binding',[(-.184,.026,.026,-.180),(-.196,.025,.025,-.181)],hair,p,n=8);pigment(band,[.44])
sweep(p,'Crane · folded tail',[(0,-.191,-.180),(-.021,-.219,-.194),(.019,-.245,-.196),(.004,-.267,-.186)],.025,.014,True)
for o in [r]+list(r.children_recursive):o['craneAsset']=True
# Preserve named source components before the exporter merges their geometry.
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/source/hair-crane.blend'))
export(r,d)
partdir=CAPSULE/'parts';partdir.mkdir(parents=True,exist_ok=True)
(partdir/'hair-crane.json').write_text(json.dumps(d,indent=2)+'\n')
print('CRANE_READY',json.dumps(d),flush=True)
