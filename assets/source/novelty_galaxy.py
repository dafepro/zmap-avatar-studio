"""Pocket Galaxy: three solid miniature toys in one bounded orbital assembly.

Executed by reference_kit.py. Coordinates are socket-local Y-up/+Z-forward.
The runtime's existing orbit behavior animates the complete root attachment;
reduced motion freezes it. No billboard, transparent dome or custom shader.
"""


def galaxy_annulus(parent, name, center, outer, inner, thickness, material, tilt=0, n=12):
    vertices=[]
    for y,radius in [(-thickness,outer),(thickness,outer),(thickness,inner),(-thickness,inner)]:
        for i in range(n):
            a=i*math.tau/n;x=radius*math.sin(a);z=radius*math.cos(a)
            vertices.append((center[0]+x*math.cos(tilt)-y*math.sin(tilt),
                             center[1]+x*math.sin(tilt)+y*math.cos(tilt),center[2]+z))
    faces=[]
    for row in range(4):
        for i in range(n):
            j=(i+1)%n;next_row=(row+1)%4
            faces.append((row*n+i,row*n+j,next_row*n+j,next_row*n+i))
    return mesh(name,vertices,faces,material,parent)


def build_pocket_galaxy(parent):
    teal=mat('Galaxy saucer teal','#4d9b91')
    pale=mat('Galaxy cheerful cabin','#bde7d7')
    gold=mat('Galaxy golden rim','#edbe53')
    coral=mat('Galaxy coral star','#ee816b')
    dark=mat('Galaxy eye ink','#172c2d')
    # UFO at the front of the orbital circle. The annular shoulder belongs to
    # the same closed mesh as the underside, with a separate opaque cabin.
    x,z=0,.82
    saucer=rings('Pocket UFO hull',[(.249,.059,.059,z),(.263,.116,.116,z),
                                  (.285,.148,.148,z),(.303,.089,.089,z)],teal,parent,12)
    saucer.data.materials.append(gold)
    for poly in saucer.data.polygons:
        if all(saucer.data.vertices[i].co.z>.288 for i in poly.vertices):poly.material_index=1
    dome=smooth(rings('Pocket UFO opaque smiling cabin',[(.304,.087,.087,z),
                 (.342,.077,.077,z),(.373,.047,.047,z),(.386,.002,.002,z)],pale,parent,12))
    # Project the little eye decals onto actual cabin triangles, so their
    # contact survives faceting instead of hovering on an assumed sphere.
    from mathutils.bvhtree import BVHTree
    dome.data.calc_loop_triangles()
    surface=BVHTree.FromPolygons([Vector((v.co.x,v.co.z,-v.co.y)) for v in dome.data.vertices],
                                [tuple(t.vertices) for t in dome.data.loop_triangles],all_triangles=True)
    for sign in [-1,1]:
        points=[]
        for i in range(8):
            a=i*math.tau/8;xx=sign*.025+math.cos(a)*.007;yy=.345+math.sin(a)*.012
            hit=surface.ray_cast(Vector((xx,yy,z+.3)),Vector((0,0,-1)),1)[0]
            if hit is None:raise ValueError('Galaxy eye misses cabin')
            points.append((xx,yy,hit.z+.001))
        mesh('Pocket UFO eye',points,[tuple(range(8))],dark,parent)
    # Saturn is offset behind one ankle; the asymmetry stays fixed as the
    # complete assembly rotates, unlike independent camera-facing sprites.
    center=(-.75,.323,-.32)
    ico('Pocket Saturn',center,(.062,.062,.062),gold,parent,1)
    galaxy_annulus(parent,'Pocket Saturn tilted ring',center,.10,.057,.0045,teal,.36,12)
    # A biconvex eight-edge comic star reads from the back and oblique views.
    center=(.75,.294,-.31);vertices=[]
    for i in range(8):
        a=i*math.tau/8;radius=.070 if i%2==0 else .025
        vertices.append((center[0]+math.sin(a)*radius,center[1]+math.cos(a)*radius,center[2]))
    vertices.extend([(center[0],center[1],center[2]+.021),(center[0],center[1],center[2]-.021)])
    faces=[]
    for i in range(8):faces.extend([(i,(i+1)%8,8),((i+1)%8,i,9)])
    mesh('Pocket coral compass star',vertices,faces,coral,parent)
    # Three small gold dashes hint at a path without drawing a permanent ring.
    for a in [.61,2.62,4.1]:
        xx,zz=math.sin(a)*.80,math.cos(a)*.80
        obj=box('Pocket orbit dash',(xx,.29,zz),(.020,.006,.009),gold,parent,0)
        obj.rotation_euler.z=-a
