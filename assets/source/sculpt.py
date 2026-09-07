"""Sculpted, smoothly deforming surfaces for the illustrated kit.
Executed inside build_kit.py's authoring namespace; Y-up positions throughout.
"""
from mathutils import Matrix

def smooth(o):
    for p in o.data.polygons:p.use_smooth=True
    return o

def union(parts,name,voxel=.012,ratio=.45):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=parts[0];obj.name=name
    obj.data.remesh_voxel_size=voxel;bpy.ops.object.voxel_remesh()
    mod=obj.modifiers.new('Relax sculpted silhouette','SMOOTH');mod.factor=.6;mod.iterations=4;bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=obj.modifiers.new('Surface budget','DECIMATE');mod.ratio=ratio;bpy.ops.object.modifier_apply(modifier=mod.name)
    return smooth(obj)

def blend(a,b,t):return a+(b-a)*max(0,min(1,t))
def ease(a,b,t):
    t=max(0,min(1,(t-a)/(b-a)));return t*t*(3-2*t)

def bind_surface(root,record,parts):
    """One export rig per modular garment; runtime binds to a shared socket skeleton."""
    p=mount(root,record,'root')
    armdata=bpy.data.armatures.new(record['id']+' rig');arm=bpy.data.objects.new(record['id']+'_rig',armdata);bpy.context.collection.objects.link(arm);arm.parent=p
    bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
    for s in sockets:
        bone=armdata.edit_bones.new(s['id']);bone.head=co(positions[s['id']]);bone.tail=Vector(bone.head)+Vector((0,0,.08))
        if s['parent']:bone.parent=armdata.edit_bones[s['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in parts:
        obj.parent=p
        for s in sockets:obj.vertex_groups.new(name=s['id'])
        bpy.context.view_layer.update()
        vertices=[obj.matrix_world@vert.co for vert in obj.data.vertices]
        points=[(v.x,v.z,-v.y) for v in vertices]
        adjacent=[set() for _ in points]
        for edge in obj.data.edges:
            a,b=edge.vertices;adjacent[a].add(b);adjacent[b].add(a)
        # Exposed body surfaces are deliberately separated by the regions
        # hidden under clothing. Classify an entire connected component, so a
        # forearm cannot abruptly turn into a hip at one coordinate threshold.
        families={}
        if record['slot']=='body':
            remaining=set(range(len(points)))
            while remaining:
                seed=remaining.pop();component=[seed];pending=[seed]
                while pending:
                    for other in adjacent[pending.pop()]:
                        if other in remaining:remaining.remove(other);component.append(other);pending.append(other)
                cx=sum(points[i][0] for i in component)/len(component)
                cy=sum(points[i][1] for i in component)/len(component)
                family='hand' if obj.name.startswith('Sculpted hand') else ('arm' if abs(cx)>.215 and cy>.7 else ('leg' if cy<.9 else 'chest'))
                for i in component:families[i]=(family,'R' if cx>=0 else 'L')
        # Solve the shoulder reach on the garment's own surface graph. Seeds
        # are unambiguous torso/sleeve regions; interpolation follows connected
        # cloth instead of jumping to a nearby forearm through empty space.
        reach_field={}
        if obj.name.startswith('Connected raglan garment'):
            fixed={}
            for i,(x,y,z) in enumerate(points):
                ax=abs(x)
                if ax<.15 or (y<1.02 and ax<.235):fixed[i]=0.0
                elif ax>.305 or (y<1.1 and ax>.245):fixed[i]=1.0
                reach_field[i]=fixed.get(i,ease(.15,.305,ax))
            free=[i for i in range(len(points)) if i not in fixed and adjacent[i]]
            neighbors={i:[(j,1/max((vertices[i]-vertices[j]).length,.002)) for j in adjacent[i]] for i in free}
            for _ in range(100):
                values={i:sum(reach_field[j]*weight for j,weight in neighbors[i])/sum(weight for _,weight in neighbors[i]) for i in free}
                for i,value in values.items():reach_field[i]=value
        for vert in obj.data.vertices:
            x,y,z=points[vert.index];ax=abs(x);side='R' if x>=0 else 'L'
            weights={}
            family,side=families.get(vert.index,('garment',side))
            if family=='hand':
                weights={'hand_'+side:1}
            elif family=='arm' or obj.name.startswith('Fabric cuff') or vert.index in reach_field:
                reach=reach_field.get(vert.index,1.0)
                upper=1-ease(.97,1.095,y)
                wrist=1-ease(.785,.865,y)
                limb={'arm_'+side:1-upper,'forearm_'+side:upper*(1-wrist),'hand_'+side:upper*wrist}
                weights={'chest':1-reach,**{k:v*reach for k,v in limb.items()}}
            elif family=='leg':
                hip=ease(.75,.87,y);knee=1-ease(.46,.58,y);foot=1-ease(.12,.21,y)
                weights={'hips':hip,'leg_'+side:(1-hip)*(1-knee),'shin_'+side:(1-hip)*knee*(1-foot),'foot_'+side:(1-hip)*knee*foot}
            else:weights={'chest':1}
            weights={k:v for k,v in weights.items() if v>.00001};total=sum(weights.values())
            for bone,weight in weights.items():obj.vertex_groups[bone].add([vert.index],weight/total,'REPLACE')
        modifier=obj.modifiers.new('Shared athlete skin','ARMATURE');modifier.object=arm;obj.matrix_parent_inverse=Matrix.Identity(4)
    record['skin']={'bones':[s['id'] for s in sockets]}
    return p

def worldrings(name,rs,material,offset=(0,0,0),n=16):
    obj=rings(name,rs,material,None,n);obj.location=co(offset);return obj

def limb_rings(name,rs,material,proximal,distal,n=16):
    """Sweep the cross sections down the rest-pose limb, including its outward lean."""
    start,end=positions[proximal],positions[distal]
    obj=worldrings(name,rs,material,start,n)
    slope=(end.x-start.x)/(end.y-start.y)
    depth=(end.z-start.z)/(end.y-start.y)
    for vertex in obj.data.vertices:
        vertex.co.x+=vertex.co.z*slope
        vertex.co.y-=vertex.co.z*depth
    return obj

def sculpt_body():
    r,d=asset('body-athletic','Athletic','body','Connected shoulder, collarbone and limbs with blended skin weights and naturally curled hands.')
    parts=[worldrings('Athletic torso',[(.84,.19,.12,0),(1.02,.17,.105,0),(1.19,.23,.12,0),(1.26,.242,.10,0),(1.33,.115,.075,0)],skin),worldrings('Neck',[(1.27,.086,.074,0),(1.46,.075,.075,0)],skin),ico('Hips',(0,.86,0),(.20,.13,.12),skin,None,2)]
    hands=[]
    for sign,side in [(-1,'L'),(1,'R')]:
        a=positions['arm_'+side];elbow=positions['forearm_'+side];hand=positions['hand_'+side];leg=positions['leg_'+side];shin=positions['shin_'+side]
        parts.extend([
            limb_rings('Deltoid',[(.01,.060,.066,0),(-.075,.065,.066,0),(-.19,.048,.053,.003),(-.28,.043,.048,.005)],skin,'arm_'+side,'forearm_'+side),
            limb_rings('Forearm',[(.028,.044,.050,.005),(-.055,.055,.061,.008),(-.15,.045,.049,.015),(-.23,.041,.047,.021)],skin,'forearm_'+side,'hand_'+side),
            worldrings('Thigh',[(.035,.098,.111,0),(-.16,.093,.101,0),(-.35,.071,.077,.008)],skin,leg),
            worldrings('Calf',[(.025,.073,.079,.007),(-.12,.079,.08,-.007),(-.25,.057,.061,0),(-.365,.049,.055,0)],skin,shin)])
        # Palm/thenar mound and tapered curled digits share a voxel surface, not cylinders stuck to a box.
        bits=[ico('Palm',(hand.x,hand.y-.042,hand.z+.017),(.055,.067,.034),skin,None,2),ico('Thumb pad',(hand.x-sign*.027,hand.y-.042,hand.z+.036),(.035,.048,.032),skin,None,2)]
        for i in range(4):
            x=hand.x+(i-1.5)*.025;length=[.067,.082,.088,.074][i];out=(i-1.5)*.003
            points=[(x,hand.y-.078,.025),(x+out,hand.y-.098-length*.30,.032),(x+out,hand.y-.094-length*.65,.037),(x+out*.8,hand.y-.091-length*.80,.048)]
            for a1,b1,rad in zip(points,points[1:],[.0135,.012,.010]):
                before=set(bpy.data.objects);line('Finger sculpt',[a1,b1],rad,skin,None);bits.extend(o for o in bpy.data.objects if o not in before)
            bits.append(ico('Fingertip',points[-1],(.010,.012,.011),skin,None,2))
        thumb=[(hand.x-sign*.042,hand.y-.019,.035),(hand.x-sign*.066,hand.y-.049,.059),(hand.x-sign*.057,hand.y-.080,.075)]
        before=set(bpy.data.objects);line('Opposable thumb',thumb,.016,skin,None);bits.extend(o for o in bpy.data.objects if o not in before);bits.append(ico('Thumb tip',thumb[-1],(.014,.018,.014),skin,None,2))
        hands.append(union(bits,'Sculpted hand '+side,.005,.15))
    torso=union(parts,'Connected athletic skin',.012,.10)
    # Every approved top covers these body regions. Omit hidden skin so no cap or
    # torso can poke through the fitted garment at a deformed shoulder or waistband.
    bm=bmesh.new();bm.from_mesh(torso.data);remove=[]
    for face in bm.faces:
        pts=[torso.matrix_world@v.co for v in face.verts]
        if all((.64<p.z<1.335 and abs(p.x)<.235) or (1.102<p.z<1.34 and abs(p.x)>=.15) for p in pts):remove.append(face)
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    # Decimated triangles can cross the covered/uncovered boundary. Deleting
    # only wholly covered faces leaves sharp skin teeth above the cuff. Clip
    # each exposed arm geometrically at the common sleeve-cover plane instead.
    remaining=set(bm.verts);arm_components=[]
    while remaining:
        seed=remaining.pop();component=[seed];pending=[seed]
        while pending:
            vertex=pending.pop()
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other in remaining:remaining.remove(other);component.append(other);pending.append(other)
        center=sum((torso.matrix_world@vertex.co for vertex in component),Vector())/len(component)
        if abs(center.x)>.215 and center.z>.7:arm_components.append(component)
    plane=torso.matrix_world.inverted()@Vector((0,0,1.102))
    normal=torso.matrix_world.to_3x3().transposed()@Vector((0,0,1))
    for component in arm_components:
        edges={edge for vertex in component for edge in vertex.link_edges}
        faces={face for vertex in component for face in vertex.link_faces}
        bmesh.ops.bisect_plane(bm,geom=[*component,*edges,*faces],dist=.000001,plane_co=plane,plane_no=normal,clear_outer=True,clear_inner=False)
    bm.to_mesh(torso.data);bm.free()
    bind_surface(r,d,[torso,*hands]);export(r,d)

# Designed profile landmarks, not a sphere: projecting chin, jaw angle,
# broad cheek planes and a flatter forehead. Values are height/width/depth/offset.
HEAD_ROWS=[(-.225,.055,.083,.083),(-.209,.095,.132,.051),(-.176,.155,.157,.020),(-.10,.211,.180,.002),(-.025,.231,.188,.010),(.065,.233,.191,.008),(.14,.225,.182,-.002),(.20,.180,.161,-.025),(.225,.105,.108,-.029)]

def head_section(y):
    for i in range(len(HEAD_ROWS)-1):
        a,b=HEAD_ROWS[i:i+2]
        if y<=b[0]:
            t=max(0,min(1,(y-a[0])/(b[0]-a[0])));return tuple(blend(a[j],b[j],t) for j in [1,2,3])
    return HEAD_ROWS[-1][1:]
def face_depth(x,y):
    rx,rz,zc=head_section(y)
    # A broad front plane rolls into a narrow cheek bevel, instead of a rounded
    # globe. All facial paint follows this same surface and nose profile.
    z=zc+rz*max(0,1-(abs(x)/rx)**2.8)**(1/2.8)
    nose_profile=[(-.10,0),(-.073,.34),(-.045,1),(-.015,.73),(.04,.28),(.085,0)]
    nose=0
    for a,b in zip(nose_profile,nose_profile[1:]):
        if a[0]<=y<=b[0]:nose=blend(a[1],b[1],(y-a[0])/(b[0]-a[0]));break
    z+=.040*nose*max(0,1-abs(x)/.052)**1.35
    # Lip shelf and chin break stay part of the continuous head, not attached primitives.
    z+=.009*max(0,1-abs(x)/.08)*max(0,1-abs(y+.122)/.027)
    return z

def head_rows():
    return sorted(set([row[0] for row in HEAD_ROWS]+[(a[0]+b[0])/2 for a,b in zip(HEAD_ROWS,HEAD_ROWS[1:])]+[-.073,-.045,-.015,.04,.085,-.122]))

def sculpt_head(id,label,wide):
    r,d=asset(id,label,'head','A continuous softly sculpted face, cheek and jaw with a shared painted feature surface.');p=mount(r,d,'head')
    verts=[];ys=head_rows();rows=len(ys)
    for y in ys:
        rx,rz,zc=head_section(y)
        for j in range(32):
            a=j*math.pi*2/32;x=math.sin(a)*rx;z=zc+math.cos(a)*rz
            if math.cos(a)>0:z=face_depth(x,y)
            # The alternative head varies the back/jaw, not the common face decal envelope.
            if z<0:x*=wide
            verts.append((x,y,z))
    faces=[tuple(reversed(range(32))),tuple(range((rows-1)*32,rows*32))]
    for i in range(rows-1):
        for j in range(32):faces.append((i*32+j,i*32+(j+1)%32,(i+1)*32+(j+1)%32,(i+1)*32+j))
    smooth(mesh('Continuous face volume',verts,faces,skin,p))
    for x in [-.235,.235]:smooth(ico('Ear',(x,-.035,-.005),(.042,.064,.032),skin,p,2))
    export(r,d)

def painted_face(id,label,index):
    r,d=asset(id,label,'face','Drawn expression on one fitted surface; no individually lit eye or mouth primitives.');p=mount(r,d,'head')
    art=bpy.data.images.load(str(ROOT/'assets/textures/face-ink.png'),check_existing=True)
    m=bpy.data.materials.new('face-ink');m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=art
    m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);m.node_tree.links.new(tex.outputs['Alpha'],bs.inputs['Alpha']);bs.inputs['Roughness'].default_value=1
    m.surface_render_method='DITHERED';m.use_backface_culling=True
    # Atlas UVs use authored expression cells; empty pixels reveal the continuously lit head below.
    # Use the exact front-half vertex grid of the head. Independent regular
    # decal tessellation cut through the newly angular nose between landmarks.
    # Coincident topology plus a small separation keeps every ink mark attached.
    verts=[];uvs=[];ys=head_rows();columns=17
    for y in ys:
        rx,_,_=head_section(y)
        for j in range(columns):
            a=(j-8)*math.pi/16;x=math.sin(a)*rx
            verts.append((x,y,face_depth(x,y)+.0008))
            u=max(.001,min(.999,x/.43+.5));v=max(.001,min(.999,(y+.19)/.365))
            uvs.append(((index%2+u)/2,(1-index//2+v)/2))
    faces=[]
    for iy in range(len(ys)-1):
        for ix in range(columns-1):a=iy*columns+ix;faces.append((a,a+1,a+columns+1,a+columns))
    obj=smooth(mesh('Painted expression',verts,faces,m,p));layer=obj.data.uv_layers.new(name='Expression atlas')
    for poly in obj.data.polygons:
        for li in poly.loop_indices:layer.data[li].uv=uvs[obj.data.loops[li].vertex_index]
    d['texture']={'maxDimension':1024,'maxCount':1};export(r,d)

def sculpt_top(id,label,style):
    r,d=asset(id,label,'shirt','One connected collarbone, shoulder and sleeve surface with blended deformation.')
    chest=positions['chest'];parts=[];details=[]
    parts.append(worldrings('Garment torso',[(-.235,.203,.135,0),(-.19,.207,.139,0),(-.06,.214,.143,0),(.10,.229,.133,0),(.155,.224,.120,0),(.205,.161,.099,0),(.239,.092,.086,0)],primary,chest,20))
    for side in ['L','R']:
        sign=-1 if side=='L' else 1
        parts.append(ico('Collarbone sweep',(sign*.165,1.283,0),(.158,.063,.110),primary,None,3))
        parts.append(limb_rings('Raglan shoulder',[(.018,.035,.058,0),(-.015,.066,.083,0),(-.065,.084,.092,0),(-.12,.081,.088,0),(-.182 if style=='jersey' else -.28,.069,.075,0)],primary,'arm_'+side,'forearm_'+side,20))
        if style!='jersey':parts.append(limb_rings('Flowing sleeve',[(.035,.072,.082,0),(-.08,.071,.078,0),(-.19,.056,.066,.012),(-.225,.049,.058,.016)],primary,'forearm_'+side,'hand_'+side,20))
        offset=positions['arm_'+side] if style=='jersey' else positions['forearm_'+side]
        a,b=(-.19,-.165) if style=='jersey' else (-.233,-.202);radius=.073 if style=='jersey' else .053
        details.append(smooth(limb_rings('Fabric cuff',[(a,radius,radius+.007,.008),(b,radius+.003,radius+.009,.005)],trim,('arm_' if style=='jersey' else 'forearm_')+side,('forearm_' if style=='jersey' else 'hand_')+side,20)))
    torso=union(parts,'Connected raglan garment',.010,.10)
    # Collar and hem are fitted trim surfaces; the former now follows the continuous neckline.
    details.append(smooth(worldrings('Neck binding',[(.234,.102,.095,0),(.252,.096,.090,0)],trim,chest,24)))
    details.append(smooth(worldrings('Hem binding',[(-.235,.205,.138,0),(-.219,.204,.137,0)],primary,chest,24)))
    # Small authored marks lie on the cloth rather than forming protruding triangular shards.
    crest=mesh('Club crest',[(-.155,.099,.119),(-.106,.099,.141),(-.109,.054,.14),(-.13,.041,.13),(-.152,.054,.120)],[(0,4,3,2,1)],trim,None);crest.location=co(chest);details.append(crest)
    if style=='hoodie':
        details.append(smooth(ico('Folded hood',(0,1.34,-.105),(.162,.095,.080),primary,None,2)))
        before=set(bpy.data.objects)
        for x in [-.055,.055]:line('Drawcord',[(x,1.32,.099),(x,1.16,.142)],.004,trim,None)
        details.extend(o for o in bpy.data.objects if o not in before)
        pocket=mesh('Pocket stitching',[(-.11,-.075,.13),(-.08,-.053,.14),(.08,-.053,.14),(.11,-.075,.13),(.10,-.17,.127),(-.10,-.17,.127)],[(0,5,4,3,2,1)],primary,None);pocket.location=co(chest);details.append(pocket)
    if style=='track':
        before=set(bpy.data.objects);line('Zip',[(0,.844,.151),(0,1.32,.091)],.003,trim,None);details.extend(o for o in bpy.data.objects if o not in before)
    # Project a drawn cloth wash onto the front torso; white atlas pixels leave
    # sleeves/back untouched. The authored color multiplies the palette rather
    # than baking a shirt color, so modular recoloring stays exact.
    cloth=primary.copy();cloth.name=id+' painted cloth';cloth['paletteChannel']='primary'
    nodes=cloth.node_tree.nodes;links=cloth.node_tree.links;bs=nodes.get('Principled BSDF')
    tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'assets/textures/garment-wash.png'),check_existing=True)
    multiply=nodes.new('ShaderNodeMixRGB');multiply.name='Palette multiply';multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1;multiply.inputs[2].default_value=primary.diffuse_color
    links.new(tex.outputs['Color'],multiply.inputs[1]);links.new(multiply.outputs[0],bs.inputs['Base Color'])
    # glTF's baseColorFactor carries the palette; image RGB is the white-relative wash.
    for obj in [torso,*details]:
        for slot in obj.material_slots:
            if slot.material==primary:slot.material=cloth
        layer=obj.data.uv_layers.new(name='Drawn cloth projection')
        for poly in obj.data.polygons:
            for li in poly.loop_indices:
                v=obj.matrix_world@obj.data.vertices[obj.data.loops[li].vertex_index].co
                if -v.y>.075 and abs(v.x)<.235 and .86<v.z<1.36:uv=(max(.02,min(.98,(v.x+.235)/.47)),max(.02,min(.98,(v.z-.86)/.50)))
                else:uv=(.5,.5)
                layer.data[li].uv=uv
    d['texture']={'maxDimension':256,'maxCount':1}
    bind_surface(r,d,[torso,*details]);export(r,d)
