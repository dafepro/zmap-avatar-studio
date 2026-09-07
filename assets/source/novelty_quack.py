"""Quack Captain, authored from the isolated four-view novelty study.

Execute in reference_kit.py globals, after the legacy accessory scale mapping.
Coordinates are head-local metres, Y up and +Z forward. Original fixed colours
keep the duck recognisable with every outfit. One continuous teal exterior
encloses the shared upper hair-containment ellipsoid. Its wearing aperture stays
open: no hidden cap or torus inner wall crosses the contained hair.
"""

from mathutils.bvhtree import BVHTree


def quack_pigment(obj, values):
    attribute=obj.data.color_attributes.new(name='Original pigment',type='FLOAT_COLOR',domain='CORNER')
    for polygon in obj.data.polygons:
        for loop in polygon.loop_indices:
            value=values[obj.data.loops[loop].vertex_index]
            attribute.data[loop].color=(value,value,value,1)


def quack_crown(parent, material):
    """One open-bottom shell: cuff, outer inflatable ring, shoulder and roof.

    The ring's inner return is the supporting roof itself, so the complete
    surface clears the fit solid. There are no hidden interior collision faces.
    """
    # The inflatable bulge sits around the duck's belly, above the soft cuff.
    # A shallow downward return at the inner lip makes a readable round float;
    # the remaining roof is a small support under the toy, not a broad cone.
    # Blended hair can rise toward the containment centre (.1125), even when
    # its original Y is below the transition end (.0675). Keep the open entry
    # above both heights, so partially contained tails never hit a low cuff.
    profile=[(.125,.237,.230),(.150,.238,.231),(.170,.271,.264),
             (.205,.297,.290),(.244,.287,.280),(.268,.255,.248),
             (.264,.199,.192),(.303,.130,.126),(.325,.010,.010)]
    shades=[.70,.76,.86,.96,1,.99,.79,.86,.91]
    count=16;vertices=[];values=[]
    for row,(y,rx,rz) in enumerate(profile):
        for i in range(count):
            angle=math.tau*i/count
            vertices.append((rx*math.sin(angle),y,-.0096+rz*math.cos(angle)))
            values.append(shades[row])
    vertices.append((0,.330,-.0096));values.append(.93);faces=[]
    for row in range(len(profile)-1):
        for i in range(count):
            a=row*count+i;b=row*count+(i+1)%count
            faces.append((a,b,b+count,a+count))
    last=(len(profile)-1)*count;apex=len(vertices)-1
    faces.extend((last+i,last+(i+1)%count,apex) for i in range(count))
    crown=smooth(mesh('Quack continuous cuff ring and roof',vertices,faces,material,parent))
    quack_pigment(crown,values)
    return crown


def quack_lentil(name, outline, outer, inner, material, parent):
    """A closed broad mass with a pointed authored silhouette, not a card."""
    vertices=list(outline)+[outer,inner];count=len(outline)
    faces=[]
    for i in range(count):
        faces.extend([(i,(i+1)%count,count),((i+1)%count,i,count+1)])
    return smooth(mesh(name,vertices,faces,material,parent))


def quack_bill(parent, orange, dark):
    back=[(-.071,.434),(-.056,.455),(0,.466),(.056,.455),(.071,.434),(0,.423)]
    front=[(-.069,.431),(-.052,.444),(0,.451),(.052,.444),(.069,.431),(0,.416)]
    vertices=[(x,y,.148) for x,y in back]
    vertices.extend((x,y,.233-.055*abs(x)) for x,y in front)
    faces=[(i,(i+1)%6,(i+1)%6+6,i+6) for i in range(6)]
    faces.extend([tuple(reversed(range(6))),tuple(range(6,12))])
    obj=smooth(mesh('Quack broad flattened orange bill',vertices,faces,orange,parent))
    quack_pigment(obj,[.94]*6+[.92,1,1,1,.92,.77])
    # The broad bill's smile is a thin inset-painted break, not a thick tube.
    vertices=[]
    for i in range(5):
        x=-.066+.132*i/4;y=.428-.006*(1-(x/.066)**2)
        for side in (-1,1):vertices.append((x,y+side*.00135,.2343-.055*abs(x)))
    faces=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(4)]
    mesh('Quack ink bill smile',vertices,faces,dark,parent)


def quack_eyes(parent, body, dark, light):
    vertices=[Vector((v.co.x,v.co.z,-v.co.y)) for v in body.data.vertices]
    faces=[tuple(p.vertices) for p in body.data.polygons]
    surface=BVHTree.FromPolygons(vertices,faces)
    def project(x,y,offset):
        hit,_,_,_=surface.ray_cast(Vector((x,y,.6)),Vector((0,0,-1)))
        if hit is None:raise ValueError('Quack eye left its authored head surface')
        return tuple(hit+Vector((0,0,offset)))
    for sign in (-1,1):
        # A sampled fan conforms to the actual polygonal cheek. A guessed oval
        # plane left the old eyes partially buried after the head tessellated.
        x=sign*.063;y=.492
        vertices=[project(x+.0125*math.cos(i*math.tau/8),y+.022*math.sin(i*math.tau/8),.004) for i in range(8)]
        vertices.append(project(x,y,.004))
        mesh('Quack dark eye',vertices,[(i,(i+1)%8,8) for i in range(8)],dark,parent)
        vertices=[project(x-.002+dx,y+.008+dy,.0055) for dx,dy in [(0,.003),(-.002,-.0015),(.002,-.0015)]]
        mesh('Quack tiny eye glint',vertices,[(0,1,2)],light,parent)


def quack_tail(parent, material):
    # The fan's narrow upper point tilts back; a wedge gives it body in all views.
    outline=[(.315,-.124,.068),(.382,-.184,.059),(.493,-.224,.007),
             (.483,-.251,.010),(.364,-.238,.060)]
    vertices=[(sign*width,y,z) for sign in (-1,1) for y,z,width in outline]
    faces=[tuple(reversed(range(5))),tuple(range(5,10))]
    faces.extend((i,(i+1)%5,(i+1)%5+5,i+5) for i in range(5))
    obj=smooth(mesh('Quack upturned tail fan',vertices,faces,material,parent))
    quack_pigment(obj,[.88,.96,1,.96,.87]*2)


def build_quack(parent):
    yellow=mat('Quack sunflower rubber','#FFD23B')
    orange=mat('Quack tangerine bill','#EC7819')
    teal=mat('Quack lagoon swim ring','#29AAA7')
    dark=mat('Quack original ink','#163237')
    light=mat('Quack warm highlight','#FFF3BB')
    quack_crown(parent,teal)
    before=set(parent.children)
    # One joined body/neck/head surface makes the rubber toy a coherent mass.
    body=section('Quack joined rubber body and head',[
        # After the assembly lift even the hidden bottom cap is above the fit
        # ellipsoid, so invisible toy geometry cannot intersect contained hair.
        (.267,0,-.026,.095,.087),(.281,0,-.032,.132,.134),
        (.304,0,-.033,.151,.162),(.365,0,-.012,.147,.146),
        (.401,0,.040,.100,.094),(.466,0,.069,.124,.108),
        (.526,0,.060,.107,.090),(.557,0,.052,.063,.057),
        (.568,0,.050,.014,.014),
    ],yellow,parent,n=12)
    smooth(body)
    quack_pigment(body,[.88+.10*max(0,math.sin(i%12*math.tau/12+.55)) for i in range(108)])
    for sign in (-1,1):
        outline=[(sign*.117,.310,.055),(sign*.187,.314,-.055),
                 (sign*.216,.348,-.135),(sign*.245,.385,-.120),
                 (sign*.192,.406,-.042),(sign*.107,.370,.060)]
        wing=quack_lentil('Quack splayed wing',outline,(sign*.235,.354,-.035),
                          (sign*.110,.352,-.035),yellow,parent)
        quack_pigment(wing,[.85,.84,.92,1,1,.94,1,.80])
    quack_tail(parent,yellow)
    outline=[(-.049,.548,.050),(-.052,.580,.050),(-.031,.575,.050),
             (-.014,.608,.050),(.013,.581,.050),(.034,.592,.050),(.043,.549,.050)]
    quack_lentil('Quack tiny crown tuft',outline,(0,.575,.090),(0,.575,.012),yellow,parent)
    quack_bill(parent,orange,dark)
    quack_eyes(parent,body,dark,light)
    for obj in parent.children:
        if obj.type!='MESH':continue
        if obj not in before:
            for vertex in obj.data.vertices:vertex.co.z+=.040
        # Joining an uncoloured crest/glint to coloured meshes otherwise fills
        # its missing attribute with black. Every authored piece starts white.
        if not obj.data.color_attributes:quack_pigment(obj,[1]*len(obj.data.vertices))
