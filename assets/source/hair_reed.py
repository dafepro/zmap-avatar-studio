"""Reed's low centre-parted curtains: one mantle and four dominant S-waves.

The support scalp is supplied by the caller. All visible panels use the same
continuous envelope as the mantle; no per-vertex ray/nearest-surface switching
is involved. Horizontal ribbon sections preserve low arches without rotating
wide sections into horns. Coordinates are head-local, Y up, +Z front.
"""
from mathutils.bvhtree import BVHTree


def reed_pigment(obj, values):
    attr = obj.data.color_attributes.new(name='Hair pigment', type='FLOAT_COLOR', domain='CORNER')
    for poly in obj.data.polygons:
        for loop in poly.loop_indices:
            value = values[obj.data.loops[loop].vertex_index]
            attr.data[loop].color = (value, value, value, 1)


def reed_section(y):
    """C1-continuous monotone section widths, shared by mantle and ribbons."""
    rows = [(-.215, .104, .132), (-.15, .153, .176), (-.07, .194, .207),
            (.025, .207, .222), (.105, .202, .221), (.18, .178, .198),
            (.225, .133, .150), (.255, .022, .042)]
    y = max(rows[0][0], min(rows[-1][0], y))
    index = next((i for i in range(len(rows)-1) if y <= rows[i+1][0]), len(rows)-2)
    h = rows[index+1][0]-rows[index][0]
    t = (y-rows[index][0])/h
    result = []
    for column in (1, 2):
        secants = [(b[column]-a[column])/(b[0]-a[0]) for a,b in zip(rows, rows[1:])]
        def slope(i):
            if i == 0:return secants[0]
            if i == len(rows)-1:return secants[-1]
            a,b = secants[i-1],secants[i]
            return 0 if a*b <= 0 else 2*a*b/(a+b)
        value = (2*t**3-3*t*t+1)*rows[index][column]
        value += (t**3-2*t*t+t)*h*slope(index)
        value += (-2*t**3+3*t*t)*rows[index+1][column]
        value += (t**3-t*t)*h*slope(index+1)
        result.append(value)
    return result


def reed_depth(x,y,back=False):
    rx,rz = reed_section(y)
    # The shoulder of this function is smooth even when a terminal curl goes
    # outside the mantle silhouette. It never switches to a far-side ray hit.
    q = abs(x)/max(rx,.001)
    radial = math.sqrt(max(.008, 1-min(q,.996)**2))
    return -.013 + (-1 if back else 1)*rz*radial


def reed_crown_height(x,y):
    """Low paired arches, applied to the support and its attached ribbons."""
    high=ease(.18,.225,y)
    arches=.038*math.exp(-((abs(x)-.082)/.045)**2)
    part=.008*math.exp(-(x/.026)**2)
    return y+high*(arches-part)


def reed_front_hem(angle):
    """The visible V opening follows the caller's frontal scalp hairline."""
    a=min(angle,math.tau-angle)
    points=[(0,.118),(.38,.163),(.85,.088),(1.25,.016),(1.57,-.178)]
    if a>points[-1][0]:return None
    for lower,upper in zip(points,points[1:]):
        if a<=upper[0]:
            t=(a-lower[0])/(upper[0]-lower[0])
            # Keep the central V, but soften the shoulders into broad arches.
            t=t*t*(3-2*t)
            return lower[1]*(1-t)+upper[1]*t
    return points[-1][1]


def reed_mantle(parent):
    count=28
    stations=[0,.035,.095,.19,.32,.48,.65,.82,1]
    vertices,faces,values=[],[],[]
    for t in stations:
        for j in range(count):
            a=j*math.tau/count;front=max(0,math.cos(a))
            hem=-.156+.270*front**2
            hem+=.073*math.exp(-((abs(math.sin(a))-.40)/.25)**2)*front
            hem+=(.014*math.cos(6*a)+.008*math.sin(3*a))*(1-front**3)
            frontal_hem=reed_front_hem(a)
            if frontal_hem is not None:hem=frontal_hem
            y=.255*(1-t)+hem*t
            rx,rz=reed_section(y)
            # Broad alternating bulges make side/rear layers flow and turn
            # outward as one filled mass, rather than as overlapping shingles.
            wave=.012*math.exp(-((y-.025)/.055)**2)-.007*math.exp(-((y+.055)/.034)**2)
            wave+=.017*math.exp(-((y+.135)/.037)**2)
            rx+=wave*abs(math.sin(a))**2
            rz+=wave*max(0,-math.cos(a))**2
            x=math.sin(a)*rx;z=-.013+math.cos(a)*rz
            ear=math.exp(-((y+.064)/.044)**4)*math.exp(-(math.cos(a)/.19)**4)
            x-=math.copysign(.030*ear,x)
            y=reed_crown_height(x,y)
            vertices.append((x,y,z))
            stream=z+.18*abs(x)*math.sin((y+.14)*5)
            values.append(.85+.045*math.cos(stream*21))
    outer_count=len(vertices)
    inner_rows=[0,len(stations)-1]
    for row in inner_rows:
        for x,y,z in vertices[row*count:(row+1)*count]:
            radial=Vector((x,0,z+.013)).normalized()
            vertices.append((x-radial.x*.012,y-.002,z-radial.z*.012));values.append(.62)
    for inner in (False,True):
        base=outer_count if inner else 0;length=len(inner_rows) if inner else len(stations)
        for row in range(length-1):
            for j in range(count):
                a=base+row*count+j;b=base+row*count+(j+1)%count
                f=(a,b,b+count,a+count);faces.append(f if inner else tuple(reversed(f)))
    for j in range(count):
        a=(len(stations)-1)*count+j;b=(len(stations)-1)*count+(j+1)%count
        c=outer_count+count+j;d=outer_count+count+(j+1)%count
        faces.append((a,c,d,b))
    faces += [tuple(range(count)),tuple(reversed(range(outer_count,outer_count+count)))]
    obj=smooth(mesh('Reed continuous wavy mantle',vertices,faces,hair,parent))
    reed_pigment(obj,values)
    return obj


def reed_bezier(control,t):
    u=1-t
    return control[0]*u**3+control[1]*(3*u*u*t)+control[2]*(3*u*t*t)+control[3]*t**3


def reed_ribbon(parent,name,first,second,width,back=False):
    """Closed flowing ribbon: fixed horizontal sections, no section twist."""
    first=[Vector(p) for p in first];second=[Vector(p) for p in second]
    vertices,faces,values=[],[],[]
    stations=[i/10 for i in range(11)]
    split=.57
    for t in stations:
        centre=reed_bezier(first,t/split) if t<=split else reed_bezier(second,(t-split)/(1-split))
        fullness=math.sin(math.pi*t)**.72
        # A broad body, fine tip, and buried root. Avoid a wide closed end cap.
        w=width*fullness+.010*(1-t)+.0005*t
        h=.020*fullness+.003*(1-t)+.0006*t
        for j,(cross,raise_by) in enumerate([(-1,0),(-.54,.65),(0,1),(.55,.68),(1,0),(0,-.80)]):
            x=centre.x+cross*w;y=centre.y
            z=reed_depth(x,y,back)
            # The inner wall overlaps the support everywhere. Raised ribbon
            # faces carry the flow, while roots and edges remain attached.
            z+=(-1 if back else 1)*(.002+raise_by*h)
            vertices.append((x,reed_crown_height(x,y),z))
            values.append([.83,.96,1,.94,.82,.69][j]*(.98+.02*math.cos(t*math.tau)))
    count=6
    for row in range(len(stations)-1):
        for j in range(count):
            a=row*count+j;b=row*count+(j+1)%count
            faces.append((a,b,b+count,a+count))
    faces += [tuple(reversed(range(count))),tuple(range((len(stations)-1)*count,len(stations)*count))]
    obj=smooth(mesh(name,vertices,faces,hair,parent));reed_pigment(obj,values)
    return obj


def reed_temple_washes(parent,mantle):
    """Four curved painted streams sampled on the actual closed mantle.

    These are pigment, not extra independent locks: the waves stay attached
    through every view and do not create a stack of intersecting side flaps.
    """
    verts=[Vector((v.co.x,v.co.z,-v.co.y)) for v in mantle.data.vertices]
    polys=[tuple(p.vertices) for p in mantle.data.polygons]
    surface=BVHTree.FromPolygons(verts,polys)
    controls=[[(0,.183,.129),(0,.040,.042),(0,.130,-.058),(0,.012,-.175)],
              [(0,.075,.156),(0,-.105,.027),(0,.025,-.047),(0,-.125,-.166)]]
    vertices,faces,values=[],[],[]
    for sign in (-1,1):
        for control in controls:
            control=[Vector(p) for p in control];pairs=[]
            for i in range(9):
                t=i/8;centre=reed_bezier(control,t)
                tangent=reed_bezier(control,min(1,t+.001))-reed_bezier(control,max(0,t-.001))
                across=Vector((0,-tangent.z,tangent.y)).normalized()
                width=.0045*math.sin(math.pi*t)**.6+.0003
                row=[]
                for cross in (-1,0,1):
                    point=centre+across*(width*cross)
                    hit,_,_,_=surface.ray_cast(Vector((sign*.7,point.y,point.z)),Vector((-sign,0,0)))
                    if hit is not None:row.append(tuple(hit+Vector((sign*.001,0,0))))
                if len(row)==3:pairs.append(row)
            base=len(vertices)
            for row in pairs:
                vertices.extend(row);values.extend([.83,.47,.83])
            for i in range(len(pairs)-1):
                for j in range(2):
                    a=base+3*i+j;faces.append((a,a+1,a+4,a+3))
    obj=smooth(mesh('Reed curved temple pigment',vertices,faces,hair,parent))
    reed_pigment(obj,values)


def reed_part(parent,objects):
    vertices,faces=[],[]
    for obj in objects:
        base=len(vertices)
        vertices.extend(Vector((v.co.x,v.co.z,-v.co.y)) for v in obj.data.vertices)
        faces.extend(tuple(base+i for i in p.vertices) for p in obj.data.polygons)
    surface=BVHTree.FromPolygons(vertices,faces);ribbon=[]
    for i in range(33):
        t=i/32;z=.205-.425*t;pair=[]
        for side in (-1,1):
            hit,_,_,_=surface.ray_cast(Vector((side*.0007,.8,z)),Vector((0,-1,0)))
            if hit is not None:pair.append(tuple(hit+Vector((0,.0012,0))))
        if len(pair)==2:ribbon.append(pair)
    vertices=[p for pair in ribbon for p in pair]
    faces=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(ribbon)-1)]
    obj=mesh('Reed continuous centre part',vertices,faces,hair,parent);reed_pigment(obj,[.34]*len(vertices))


def build_reed_hair(parent):
    objects=[reed_mantle(parent)]
    for sign,side in [(-1,'left'),(1,'right')]:
        offset=.006 if sign>0 else 0
        a=[(sign*.018,.236,0),(sign*.147,.237,0),(sign*.184,.126+offset,0),(sign*.141,.032+offset,0)]
        b=[a[-1],(sign*.127,-.030+offset,0),(sign*.235,-.055+offset,0),(sign*.188,-.135+offset,0)]
        objects.append(reed_ribbon(parent,'Reed '+side+' curtain S',a,b,.047))
        a=[(sign*.011,.214,0),(sign*.125,.155,0),(sign*.130,.080,0),(sign*.066,.007,0)]
        b=[a[-1],(sign*.016,-.048,0),(sign*.105,-.128,0),(sign*.121,-.178,0)]
        objects.append(reed_ribbon(parent,'Reed '+side+' layered rear S',a,b,.061,True))
    reed_temple_washes(parent,objects[0])
    reed_part(parent,objects)
