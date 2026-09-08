"""Five original hand props authored from docs/references/wield four-view sheets.

Execute in reference_kit.py globals. Coordinates are item-local Y up, +Z front;
the four upright grips have radius .020 and an unobstructed -.05..+.05 span.
build_wield_item returns logical anchor names mapped to their actual objects.
Static meshes are consolidated separately from the animated rotor/core groups.
No export, catalog, hand pose, or per-hand geometry is owned by this module.
"""

from mathutils.bvhtree import BVHTree


def wield_pigment(obj, values=None):
    if obj.data.color_attributes:return
    attribute=obj.data.color_attributes.new(name='Original pigment',type='FLOAT_COLOR',domain='CORNER')
    for polygon in obj.data.polygons:
        for loop in polygon.loop_indices:
            index=obj.data.loops[loop].vertex_index
            value=values[index] if values is not None else 1
            attribute.data[loop].color=(value,value,value,1)


def wield_anchor(key,name,parent,position=(0,0,0)):
    obj=empty(key+'__'+name,parent)
    obj.location=co(position)
    obj['wieldAnchor']=name
    return obj


def wield_z_loft(name,rows,material,parent,center=(0,0),n=12):
    """Closed front/back volume, rows are Z, X radius, Y radius."""
    vertices=[(center[0]+rx*math.cos(i*math.tau/n),center[1]+ry*math.sin(i*math.tau/n),z)
              for z,rx,ry in rows for i in range(n)]
    faces=[tuple(reversed(range(n))),tuple(range((len(rows)-1)*n,len(rows)*n))]
    for row in range(len(rows)-1):
        for i in range(n):
            a=row*n+i;b=row*n+(i+1)%n
            faces.append((a,b,b+n,a+n))
    return smooth(mesh(name,vertices,faces,material,parent))


def wield_grip(key,parent,body,trim):
    rows=[(-.064,0,0,.025,.025),(-.052,0,0,.025,.025),
          (-.050,0,0,.020,.020),(.050,0,0,.020,.020),
          (.052,0,0,.025,.025),(.064,0,0,.025,.025)]
    obj=smooth(section(key+' clean palm grip',rows,body,parent,n=8))
    obj.data.materials.append(trim)
    for polygon in obj.data.polygons:
        # Only the long central row is the grip colour; collars are outside it.
        polygon.material_index=0 if polygon.index>=2 and (polygon.index-2)//8==2 else 1
    return obj


def wield_lentil(name,outline,front,back,material,parent):
    vertices=list(outline)+[front,back];count=len(outline)
    faces=[]
    for i in range(count):faces.extend([(i,(i+1)%count,count),((i+1)%count,i,count+1)])
    return smooth(mesh(name,vertices,faces,material,parent))


def wield_front_projector(obj):
    transform=obj.matrix_basis
    vertices=[]
    for vertex in obj.data.vertices:
        point=transform@vertex.co
        vertices.append(Vector((point.x,point.z,-point.y)))
    surface=BVHTree.FromPolygons(vertices,[tuple(p.vertices) for p in obj.data.polygons])
    def project(x,y,offset=.002):
        hit,_,_,_=surface.ray_cast(Vector((x,y,1)),Vector((0,0,-1)))
        if hit is None:raise ValueError('Wield face accent missed its authored volume')
        return tuple(hit+Vector((0,0,offset)))
    return project


def wield_star(name,center,right,up,radius,material,parent):
    center=Vector(center);right=Vector(right);up=Vector(up)
    vertices=[]
    for i in range(10):
        angle=math.pi/2+i*math.tau/10;r=radius if i%2==0 else radius*.44
        vertices.append(tuple(center+right*(r*math.cos(angle))+up*(r*math.sin(angle))))
    return mesh(name,vertices,[tuple(range(10))],material,parent)


def wield_bubble(parent,m):
    wield_grip('Bubble',parent,m['coral'],m['teal'])
    section('Bubble neck',[(.062,0,0,.012,.012),(.113,0,0,.012,.012)],m['teal'],parent,n=8)
    # Bevelled annulus with a real empty opening, including the reverse view.
    cross=[(1,-.010),(1,.010),(.96,.014),(.77,.014),
           (.74,.010),(.74,-.010),(.77,-.014),(.96,-.014)]
    vertices=[];faces=[];values=[];count=16
    for scale,z in cross:
        for i in range(count):
            a=i*math.tau/count
            vertices.append((-.009+.089*scale*math.cos(a),.200+.098*scale*math.sin(a),z))
            values.append([.86,.97,1,1,.91,.80,.79,.84][len(values)//count])
    for row in range(len(cross)):
        for i in range(count):
            next_row=(row+1)%len(cross);j=(i+1)%count
            faces.append((row*count+i,row*count+j,next_row*count+j,next_row*count+i))
    loop=smooth(mesh('Bubble thick empty comet loop',vertices,faces,m['teal'],parent));wield_pigment(loop,values)
    fins=[[(.051,.254),(.130,.283),(.115,.254),(.087,.234),(.059,.230)],
          [(.065,.226),(.140,.232),(.119,.210),(.067,.202)],
          [(.060,.201),(.123,.184),(.108,.172),(.064,.177)]]
    for i,outline in enumerate(fins):
        cx=sum(x for x,y in outline)/len(outline);cy=sum(y for x,y in outline)/len(outline)
        wield_lentil('Bubble golden comet tail '+str(i),[(x,y,-.002) for x,y in outline],
                     (cx,cy,.012),(cx,cy,-.013),m['gold'],parent)
    return {'emitter':wield_anchor('bubble','emitter',parent,(0,.20,.02))}


def wield_bonk(parent,m):
    wield_grip('Bonk',parent,m['teal'],m['teal'])
    section('Bonk sturdy stem',[(.063,0,0,.018,.018),(.157,0,0,.018,.018)],m['teal'],parent,n=8)
    wield_z_loft('Bonk golden padded drum',[(-.084,.081,.081),(-.073,.099,.099),
                                           (.022,.099,.099),(.030,.088,.088)],m['gold'],parent,(0,.230),12)
    for i in range(8):
        a=i*math.tau/8
        petal=ico('Bonk soft coral petal',(.077*math.sin(a),.230+.077*math.cos(a),.037),
                  (.032,.039,.026),m['coral'],parent,1)
        smooth(petal)
    face=wield_z_loft('Bonk cream smiling cushion',[(.039,.056,.058),(.073,.051,.053),
                                                  (.085,.021,.023)],m['cream'],parent,(0,.230),12)
    project=wield_front_projector(face)
    for sign in (-1,1):
        x=sign*.021;y=.243
        vertices=[project(x+.0067*math.cos(i*math.tau/8),y+.012*math.sin(i*math.tau/8)) for i in range(8)]
        vertices.append(project(x,y))
        mesh('Bonk happy dark eye',vertices,[(i,(i+1)%8,8) for i in range(8)],m['ink'],parent)
        vertices=[project(x-.001+dx,y+.004+dy,.0034) for dx,dy in [(0,.002),(-.0015,-.001),(.0015,-.001)]]
        mesh('Bonk eye glint',vertices,[(0,1,2)],m['cream'],parent)
    vertices=[]
    for i in range(7):
        x=-.029+.058*i/6;y=.220-.012*(1-(x/.029)**2)
        for side in (-1,1):vertices.append(project(x,y+side*.0012))
    mesh('Bonk painted smile',vertices,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(6)],m['ink'],parent)
    return {'impact':wield_anchor('bonk','impact',parent,(0,.23,.08))}


def wield_lantern(parent,m):
    # Gold carrying loop and the X-axis padded palm bar. The open arch contains
    # the fingers; the lantern's body is below the grip, not balanced on a stick.
    tube('Lantern gold carrying arch',[(-.070,-.098,0),(-.079,-.078,0),(-.073,-.015,0),
             (-.052,0,0),(.052,0,0),(.073,-.015,0),(.079,-.078,0),(.070,-.098,0)],
         .008,m['gold'],parent,n=6)
    tube('Lantern horizontal padded grip',[(-.050,0,0),(.050,0,0)],.020,m['deep'],parent,n=8)
    section('Lantern shouldered roof',[(-.137,0,0,.097,.075),(-.112,0,0,.064,.050),
                                       (-.101,0,0,.059,.047)],m['deep'],parent,n=8)
    section('Lantern gold lid',[(-.101,0,0,.064,.051),(-.089,0,0,.064,.051)],m['gold'],parent,n=8)
    section('Lantern broad lower frame',[(-.321,0,0,.093,.073),(-.307,0,0,.093,.073),
                                         (-.289,0,0,.071,.056)],m['deep'],parent,n=8)
    for sx in (-1,1):
        for sz in (-1,1):
            tube('Lantern angled window pillar',[(sx*.071,-.130,sz*.054),(sx*.090,-.153,sz*.061),
                 (sx*.086,-.266,sz*.059),(sx*.070,-.290,sz*.050)],.012,m['deep'],parent,n=4)
            box('Lantern gold protective foot',(sx*.066,-.322,sz*.046),(.037,.019,.032),m['gold'],parent,bevel=0)
        ico('Lantern carry hinge',(sx*.071,-.094,0),(.014,.014,.011),m['gold'],parent,1)
        for y,radius in [(-.178,.010),(-.244,.0075)]:
            t=(y+.153)/(-.113);x=sx*(.090-.004*t);z=.061-.002*t
            normal=Vector((sx*.78,0,.63)).normalized();right=Vector((.63,0,-sx*.78)).normalized()
            center=Vector((x,y,z))+normal*.0115
            wield_star('Lantern inset window star',tuple(center),tuple(right),(0,1,0),radius,m['gold'],parent)
    wield_star('Lantern foot star',(0,-.307,.075),(1,0,0),(0,1,0),.013,m['gold'],parent)
    core=wield_anchor('lantern','core',parent,(0,-.211,0))
    heart=mat('Firefly original luminous heart','#FFE396')
    shader=heart.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value=(*heart.diffuse_color[:3],1)
    shader.inputs['Emission Strength'].default_value=.28
    outline=[(0,.040),(-.020,.064),(-.045,.066),(-.060,.052),(-.062,.027),(-.050,-.010),
             (0,-.073),(.050,-.010),(.062,.027),(.060,.052),(.045,.066),(.020,.064)]
    wield_lentil('Lantern solid luminous heart',[(x,y,0) for x,y in outline],
                 (0,-.003,.043),(0,-.003,-.043),heart,core)
    return {'light':wield_anchor('lantern','light',parent,(0,-.20,0)),'core':core}


def wield_clip_polygon(polygon,coefficient,bound,keep_above):
    result=[]
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        av=a[1]+coefficient*a[0]-bound;bv=b[1]+coefficient*b[0]-bound
        ai=av>=-1e-9 if keep_above else av<=1e-9
        bi=bv>=-1e-9 if keep_above else bv<=1e-9
        if ai:result.append(a)
        if ai!=bi:
            t=av/(av-bv);result.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    return result


def wield_marker_barrel(parent,m):
    """One watertight barrel with shared material boundaries and cap vertices.

    Clipping determines the diagonal colours in an unwrap. Each sector maps
    onto its single planar cylinder facet; a shared registry welds adjacent
    bands, sectors and the wrap seam before normals/ink-shell processing.
    """
    vertices=[];faces=[];materials=[];registry={};count=12;ymin=.061;ymax=.215
    coefficient=.040/math.pi
    def vertex(point):
        key=tuple(round(value,10) for value in point)
        if key not in registry:
            registry[key]=len(vertices);vertices.append(point)
        return registry[key]
    for i in range(count):
        a=i*math.tau/count;b=(i+1)*math.tau/count
        rectangle=[(a,ymin),(b,ymin),(b,ymax),(a,ymax)]
        for period in range(5):
            for lo,hi,material_index in [(period*.080,period*.080+.026,1),
                                        (period*.080+.026,(period+1)*.080,0)]:
                polygon=wield_clip_polygon(rectangle,coefficient,lo,True)
                polygon=wield_clip_polygon(polygon,coefficient,hi,False) if polygon else []
                if len(polygon)<3:continue
                indices=[]
                for theta,y in polygon:
                    t=(theta-a)/(b-a)
                    index=vertex((.030*((1-t)*math.sin(a)+t*math.sin(b)),y,
                                  .030*((1-t)*math.cos(a)+t*math.cos(b))))
                    if not indices or indices[-1]!=index:indices.append(index)
                if indices[0]==indices[-1]:indices.pop()
                for j in range(1,len(indices)-1):
                    faces.append((indices[0],indices[j],indices[j+1]));materials.append(material_index)
    for y,reverse in [(ymin,True),(ymax,False)]:
        # Include stripe/sector intersections on the boundary: a simple 12-gon
        # cap would leave T-junctions at its edge despite a welded side wall.
        cap=sorted((i for i,p in enumerate(vertices) if abs(p[1]-y)<1e-9),
                   key=lambda i:math.atan2(vertices[i][0],vertices[i][2])%math.tau)
        center=vertex((0,y,0))
        for a,b in zip(cap,cap[1:]+cap[:1]):
            face=(center,a,b);faces.append(tuple(reversed(face)) if reverse else face);materials.append(0)
    barrel=mesh('Rocket exact diagonal cream coral barrel',vertices,faces,m['cream'],parent)
    barrel.data.materials.append(m['coral'])
    for polygon,index in zip(barrel.data.polygons,materials):polygon.material_index=index
    return barrel


def wield_marker(parent,m):
    wield_grip('Rocket',parent,m['coral'],m['coral'])
    wield_marker_barrel(parent,m)
    section('Rocket teal stepped nozzle',[(.213,0,0,.033,.033),(.228,0,0,.032,.032),
                 (.254,0,0,.022,.022),(.266,0,0,.022,.022)],m['teal'],parent,n=12)
    section('Rocket broad drawing nib',[(.265,0,0,.014,.012),(.289,0,0,.013,.010),
                 (.313,0,0,.006,.007)],m['ink'],parent,n=8)
    for i in range(3):
        a=i*math.tau/3;out=Vector((math.sin(a),0,math.cos(a)));across=Vector((math.cos(a),0,-math.sin(a)))
        outline=[(.018,-.052),(.028,-.058),(.047,-.088),(.031,-.088)]
        vertices=[]
        for side in (-1,1):
            vertices.extend(tuple(out*r+Vector((0,y,0))+across*(.0035*side)) for r,y in outline)
        faces=[(3,2,1,0),(4,5,6,7)]+[(j,(j+1)%4,(j+1)%4+4,j+4) for j in range(4)]
        mesh('Rocket gold stabilizer',vertices,faces,m['gold'],parent)
    return {'tip':wield_anchor('marker','tip',parent,(0,.313,0))}


def wield_pinwheel(parent,m):
    wield_grip('Whirl',parent,m['deep'],m['gold'])
    section('Whirl slender supporting stem',[(.063,0,-.017,.008,.008),(.223,0,-.017,.008,.008)],m['deep'],parent,n=8)
    wield_z_loft('Whirl static axle',[(-.030,.013,.013),(.012,.013,.013)],m['gold'],parent,(0,.220),8)
    rotor=wield_anchor('pinwheel','rotor',parent,(0,.220,0))
    # A folded sheet has front and back surfaces with thickness and a real
    # raised crease. All four blades and the hub belong to the spinning group.
    outline=[(0,0,.010),(-.048,.015,.009),(-.064,.072,-.004),
             (-.045,.105,.008),(0,.133,.009),(0,.045,.025)]
    for i,material in enumerate([m['coral'],m['mint'],m['gold'],m['cream']]):
        a=-i*math.pi/2
        def rotate(p):
            x,y,z=p;return (.86*(x*math.cos(a)-y*math.sin(a)),.86*(x*math.sin(a)+y*math.cos(a)),z)
        front=[rotate(p) for p in outline]+[rotate((-.026,.055,.041))]
        back=[(x,y,z-.0035) for x,y,z in front]
        vertices=front+back;count=len(outline)
        faces=[]
        for j in range(count):
            faces.extend([(j,(j+1)%count,count),((j+1)%count+7,j+7,count+7),
                          (j,j+7,(j+1)%count+7,(j+1)%count)])
        obj=mesh('Whirl folded blade '+str(i),vertices,faces,material,rotor)
        wield_pigment(obj,[.84,.90,.99,1,.95,.92,1]*2)
    wield_z_loft('Whirl gold turning hub',[(.018,.022,.022),(.032,.024,.024),
                                         (.049,.014,.014)],m['gold'],rotor,n=12)
    return {'rotor':rotor}


def wield_consolidate(group,name):
    """Join only direct mesh children, preserving every movable group/anchor."""
    pieces=[obj for obj in group.children if obj.type=='MESH']
    if not pieces:return
    for obj in pieces:wield_pigment(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces:obj.select_set(True)
    bpy.context.view_layer.objects.active=pieces[0]
    if len(pieces)>1:bpy.ops.object.join()
    pieces[0].name=name


def build_wield_item(key,parent):
    builders={'bubble':wield_bubble,'bonk':wield_bonk,'lantern':wield_lantern,
              'marker':wield_marker,'pinwheel':wield_pinwheel}
    if key not in builders:raise ValueError('Unknown wield concept: '+str(key))
    palette={'teal':'#2DA9AF','deep':'#24595D','coral':'#EC8064',
             'gold':'#E7B73F','cream':'#F4E8C7','mint':'#8BCCB0','ink':'#1D3540'}
    materials={name:mat('Wield '+key+' original '+name,value) for name,value in palette.items()}
    anchors={'grip':wield_anchor(key,'grip',parent)}
    if key=='lantern':
        # Full carrying basis, not merely an axis alignment: +Y follows the
        # horizontal bar (-X), +Z points down, +X faces forward. The same
        # proper frame fits either hand without reflecting the lantern.
        from mathutils import Matrix
        source=Matrix(((0,-1,0),(0,0,-1),(1,0,0)))
        convert=Matrix(((1,0,0),(0,0,-1),(0,1,0)))
        anchors['grip'].rotation_mode='QUATERNION'
        anchors['grip'].rotation_quaternion=(convert@source@convert.inverted()).to_quaternion()
    anchors.update(builders[key](parent,materials))
    for role in ('rotor','core'):
        if role in anchors:wield_consolidate(anchors[role],key+'__'+role+'_mesh')
    wield_consolidate(parent,key+'__static_mesh')
    return anchors
