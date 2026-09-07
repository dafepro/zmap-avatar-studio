"""Fitting-family assets, authored in the shared head socket. Executed by build_kit.py."""
FACE_FRAME=[0,0,.43,.365]
def fit_spec(mode,offset,max_distance=.07):
    return {'targetSlot':'head','surface':'face-v1','frame':FACE_FRAME,'mode':mode,'offset':offset,'maxDistance':max_distance}

def tube_path(name,points,width,m,parent,closed=False):
    pts=[Vector(p) for p in points]
    if closed and (pts[0]-pts[-1]).length<.00001:pts.pop()
    verts=[];n=6
    for i,p in enumerate(pts):
        before=pts[i-1] if i or closed else p
        after=pts[(i+1)%len(pts)] if i+1<len(pts) or closed else p
        tangent=(after-before).normalized();axis=Vector((0,0,1))
        if abs(tangent.dot(axis))>.9:axis=Vector((0,1,0))
        u=tangent.cross(axis).normalized();v=tangent.cross(u).normalized()
        for j in range(n):verts.append(tuple(p+width*(u*math.cos(j*2*math.pi/n)+v*math.sin(j*2*math.pi/n))))
    faces=[]
    for i in range(len(pts) if closed else len(pts)-1):
        for j in range(n):faces.append((i*n+j,i*n+(j+1)%n,((i+1)%len(pts))*n+(j+1)%n,((i+1)%len(pts))*n+j))
    if not closed:faces += [tuple(reversed(range(n))),tuple(range((len(pts)-1)*n,len(pts)*n))]
    return smooth(mesh(name,verts,faces,m,parent))

def fitted_accessories():
    r,d=asset('facial-mustache','Pencil mustache','facialHair','A tapered, hair-colored mustache fitted directly to the selected face surface.');p=mount(r,d,'head')
    # Two tapered ribbons, with enough horizontal samples to follow philtrum
    # and cheeks. Deliberately above the expression's upper lip.
    for sign in [-1,1]:
        verts=[]
        for i in range(13):
            t=i/12;x=sign*(.006+.099*t)
            center=-.084-.010*math.sin(t*math.pi)+.023*t*t
            width=.009*(1-t)**.5+.001
            for y in [center-width,center+width]:verts.append((x,y,face_depth(x,y)+.003))
        faces=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(12)]
        if sign<0:faces=[tuple(reversed(f)) for f in faces]
        mesh('Tapered mustache',verts,faces,hair,p)
    d['fit']=fit_spec('surface',.003);export(r,d)

    r,d=asset('hat-club-cap','Club cap','headwear','Soft six-panel cap, shaped crown and a rear opening for gathered hair.');p=mount(r,d,'head')
    n=24;rows=5;verts=[]
    for j in range(rows):
        a=(j/(rows-1))*math.pi/2
        for i in range(n):
            t=i*math.pi*2/n;verts.append((math.sin(t)*.284*max(.015,math.cos(a)),.13+.224*math.sin(a),math.cos(t)*.267*max(.015,math.cos(a))-.012))
    faces=[]
    for j in range(rows-1):
        for i in range(n):
            # Rear exit extends to 0.26 m above the head socket; preserve a
            # solid curved crown above it and a narrow adjustable lower strap.
            if j<2 and 10<=i<=13:continue
            faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.append(tuple(range((rows-1)*n,rows*n)))
    crown=smooth(mesh('Cap crown',verts,faces,primary,p))
    bpy.context.view_layer.objects.active=crown;mod=crown.modifiers.new('Shell thickness','SOLIDIFY');mod.thickness=.006;bpy.ops.object.modifier_apply(modifier=mod.name)
    # Slightly arched visor, front outer edge lowers naturally at the corners.
    verts=[]
    for depth in [0,1]:
        for i in range(13):
            a=-1.13+2.26*i/12;x=math.sin(a)*(.284+depth*.027);z=math.cos(a)*(.267+depth*.150)-.012;y=.132-depth*.018-.014*abs(math.sin(a))
            verts.append((x,y,z))
    visor=smooth(mesh('Curved visor',verts,[(i,i+1,i+14,i+13) for i in range(12)],primary,p))
    bpy.context.view_layer.objects.active=visor;mod=visor.modifiers.new('Visor thickness','SOLIDIFY');mod.thickness=.007;bpy.ops.object.modifier_apply(modifier=mod.name)
    line('Rear adjustment',[(-.10,.139,-.259),(0,.136,-.278),(.10,.139,-.259)],.008,secondary,p)
    # Small original athletic chevron badge, inset on the crown.
    mesh('Cap badge',[(-.042,.211,.240),(0,.186,.258),(.042,.211,.240),(.033,.222,.234),(0,.204,.248),(-.033,.222,.234)],[(0,1,4,5),(1,2,3,4)],trim,p)
    d['hairFit']=[{'targetSlot':'hair','mode':'contain','center':[0,.125,-.012],'radii':[.270,.212,.253],'transition':[-.06,.075]}];export(r,d)

def fit_preview_surfaces(head_socket,parts,records):
    """Fit the editable Blender lineup using the same surface/frame contract.
    Source export meshes remain untouched. The runtime additionally qualifies
    triangle interiors and refines contact on sparse side surfaces.
    """
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update()
    for id,record in records.items():
        if not record.get('fit'):continue
        fit=record['fit'];provider=next((r for r in records.values() if r['slot']==fit['targetSlot']),None)
        if not provider or not provider.get('surface'):continue
        verts=[];faces=[]
        for pivot in parts[provider['id']]:
            for obj in pivot.children_recursive:
                if obj.type!='MESH':continue
                transform=head_socket.matrix_world.inverted()@obj.matrix_world;offset=len(verts)
                verts += [transform@v.co for v in obj.data.vertices]
                obj.data.calc_loop_triangles();faces += [tuple(offset+i for i in tri.vertices) for tri in obj.data.loop_triangles]
        surface=BVHTree.FromPolygons(verts,faces,all_triangles=True)
        source=fit['frame'];target=provider['surface']['frame'];vertices=[];shift=-float('inf')
        for pivot in parts[id]:
            for obj in pivot.children_recursive:
                if obj.type!='MESH':continue
                transform=head_socket.matrix_world.inverted()@obj.matrix_world
                for v in obj.data.vertices:
                    p=transform@v.co;x=target[0]+(p.x-source[0])*target[2]/source[2];y=target[1]+(p.z-source[1])*target[3]/source[3]
                    hit=surface.ray_cast(Vector((x,-2,y)),Vector((0,1,0)),4)[0]
                    depth=-hit.y if hit is not None else None
                    role=obj.get('fitRole') if fit.get('projection')=='wrap' else None
                    if depth is not None and role!='side':shift=max(shift,depth+fit['offset']+p.y)
                    vertices.append((v,transform.inverted(),x,y,-p.y,depth,role))
        for v,inverse,x,y,z,depth,role in vertices:
            if fit['mode']=='surface' and depth is not None:z=depth+fit['offset']
            elif fit['mode']=='clearance' and math.isfinite(shift):z+=shift
            if role=='side':
                sign=-1 if x<target[0] else 1
                hit=surface.ray_cast(Vector((sign*2,-z,y)),Vector((-sign,0,0)),4)[0]
                if hit is not None:x=sign*max(sign*x,sign*hit.x+fit['sideOffset'])
            v.co=inverse@Vector((x,-z,y))
