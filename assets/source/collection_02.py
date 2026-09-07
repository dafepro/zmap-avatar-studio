"""Ember, Tide and Volt: independent parts traced from collection-02 sheets.

Executed inside reference_kit.py's authoring context, before accessories. Hair is
one source per style; no hat-specific alternatives. Coordinates are head-local.
"""
def collection_hair(style, label):
    r,d=asset('hair-'+style,label,'hair','Collection 02: independently authored scalp and directional masses from front, side and overhead concept studies.');p=mount(r,d,'head')
    vs=[];fs=[];n=16
    for row in range(5):
        t=row/4
        for j in range(n):
            a=j*math.tau/n;f=max(0,math.cos(a));bottom=(-.158 if style=='tide' else -.105)*(1-f)+.088*f
            y=[bottom,.112,.171,.216,.25][row]
            sample=min(y,.23);rx,front,back=head_section(sample)
            if row==4:rx,front,back=.012,-.008,-.028
            x=math.sin(a)*(rx*1.10+.013)
            z=(face_depth(math.sin(a)*rx,sample)+.021 if math.cos(a)>0 else (front+back)*.5+math.cos(a)*((front-back)*.5+.021))
            vs.append((x,y+(.022 if row>0 else 0),z))
    for row in range(4):
        for j in range(n):a=row*n+j;b=row*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.append(tuple(range(4*n,5*n)))
    scalp=mesh('Fitted '+label+' scalp',vs,fs,hair,p)
    if style=='volt':
        scalp.data.materials.append(secondary)
        for poly in scalp.data.polygons:
            if sum(vs[i][1] for i in poly.vertices)/len(poly.vertices)<.105:poly.material_index=1
    if style=='ember':
        # Broad compact coiled clusters, staggered around the crown. Twenty
        # facets per mass give a rounded curl silhouette without needle spikes.
        for ring,(y,rx,rz,count,size) in enumerate([(.128,.159,.171,8,.052),(.206,.133,.140,6,.064),(.268,.068,.080,3,.065)]):
            for j in range(count):
                a=(j+.45*(ring%2))*math.tau/count
                ico('Coiled crown cluster',(math.sin(a)*rx,y+.009*math.cos(3*a),-.015+math.cos(a)*rz),(size,size*.83,size*.92),hair,p,1)
        ico('Crown keystone',(0,.281,-.019),(.056,.047,.058),hair,p,1)
    elif style=='tide':
        # Off-centre part, two broad sweeps, exposed eyes, long pointed side
        # masses reaching the jaw. Each side has a different silhouette.
        masses=[
            ([(-.04,.256,.055),(-.158,.232,.056),(-.211,.140,.119),(-.177,.041,.193),(-.044,.116,.218),(.065,.208,.154)],(-.103,.207,.220)),
            ([(.041,.258,.018),(.155,.224,.028),(.202,.128,.125),(.142,.072,.193),(.07,.152,.205),(-.04,.256,.055)],(.115,.213,.188)),
        ]
        for s in [-1,1]:
            masses += [([(s*.132,.205,.05),(s*.195,.139,.087),(s*.211,-.092,.07),(s*.16,-.194,.084),(s*.173,-.009,.148)],(s*.218,.07,.109)),
                       ([(s*.124,.195,-.100),(s*.187,.148,-.063),(s*.224,-.141,-.023),(s*.147,-.177,-.077),(s*.136,-.039,-.185)],(s*.215,.024,-.108))]
        for i,(outline,ridge) in enumerate(masses):lock('Bob sweep '+str(i),outline,ridge,hair,p)
    else:
        # Three swept waves running front to back; tight undercut remains below
        # the locks. Broad ridges are visible from the top, not just the front.
        for i,spread in enumerate([-.14,-.046,.046,.14]):
            # A varying elliptical section follows a curved swept centreline.
            # The broad back tip is tapered in both axes, never a flat plank.
            points=[(spread*.22,.126,.174,.022,.024),(spread*.70,.229,.145,.065,.048),
                    (spread,.282,.040,.065,.058),(spread*1.12,.264,-.108,.059,.053),
                    (spread*1.08,.206,-.225,.003,.003)]
            points=[(x+.020*math.sin(k*math.pi/4),y+[-.025,.015,.004,-.012][i]*math.sin(k*math.pi/4),z,w,thick) for k,(x,y,z,w,thick) in enumerate(points)]
            vs2=[];fs2=[];n2=6
            for k,(x,y,z,w,thick) in enumerate(points):
                before=points[max(0,k-1)];after=points[min(len(points)-1,k+1)]
                tangent=Vector((0,after[1]-before[1],after[2]-before[2])).normalized()
                normal=Vector((0,-tangent.z,tangent.y))
                for j in range(n2):
                    a=j*math.tau/n2;v=Vector((x,y,z))+Vector((w*math.cos(a),0,0))+normal*(thick*math.sin(a));vs2.append(tuple(v))
            for k in range(len(points)-1):
                for j in range(n2):a=k*n2+j;b=k*n2+(j+1)%n2;fs2.append((a,b,b+n2,a+n2))
            fs2+=[tuple(reversed(range(n2))),tuple(range(4*n2,5*n2))]
            mesh('Swept quiff petal '+str(i),vs2,fs2,hair,p)
    export(r,d)

def collection_shirt(style,label):
    r,d=asset('shirt-'+style,label,'shirt','Collection 02 connected sportswear: shared shoulder topology, body-size field and distinct collar/panel construction.');d['covers']=['torso']
    obj=torso_surface('Continuous V-neck jersey · '+label,True);objects=[obj]
    obj.data.materials.append(trim)
    # Modify the same connected neck ring into a crew or open standing collar.
    if style=='tide':
        for j in range(16):
            a=j*math.tau/16;v=obj.data.vertices[80+j];v.co.z+=.117*max(0,1-abs(v.co.x)/.15)*max(0,math.cos(a))
    if style in ['ember','tide']:
        for row in [6,7]:
            for j in range(16):
                a=j*math.tau/16;v=obj.data.vertices[row*16+j]
                v.co.z+=.065*max(0,math.cos(a))**1.6
                if style=='ember':v.co.z+=(row-6)*.039
                if style=='tide':v.co.y*=.77 if math.cos(a)>0 else 1
        for poly in obj.data.polygons:
            if poly.material_index==1 and style=='tide':poly.material_index=2
    for poly in obj.data.polygons:
        points=[obj.data.vertices[i].co for i in poly.vertices]
        x=sum(abs(v.x) for v in points)/len(points);y=sum(v.z for v in points)/len(points)
        if style=='tide' and 1.44<y<1.525:poly.material_index=2
        if style=='volt' and x>.16 and y>1.32:poly.material_index=1
        if style=='ember' and .15<x<.215 and y<1.35:poly.material_index=2
    if style=='ember':
        objects.append(tube('Quarter zip',[(0,1.534,.11),(0,1.45,.112),(0,1.39,.122)],.0025,secondary,n=4))
    if style=='volt':
        # Diagonal cream tape follows the front chest slope in three sections.
        objects.append(mesh('Diagonal training tape',[(-.13,1.433,.096),(-.13,1.447,.096),(0,1.40,.120),(0,1.386,.121),(.14,1.336,.094),(.14,1.35,.095)],[(0,1,2,3),(3,2,5,4)],trim,None))
        for poly in obj.data.polygons:
            if min(poly.vertices)>=96 and max(poly.vertices)<128:poly.material_index=2
    objects.append(crown('Collection chest crown',.092,1.366,.111,.035,secondary if style=='ember' else trim))
    objects.append(crown('Collection crown inset',.092,1.371,.112,.019,primary))
    bind(r,d,objects,'shirt');export(r,d)

for style,label in [('ember','Coiled crop'),('tide','Side-part bob'),('volt','Swept quiff')]:collection_hair(style,label)
for style,label in [('ember','Ember warm-up'),('tide','Tide court jersey'),('volt','Volt raglan')]:collection_shirt(style,label)
for i,(style,label) in enumerate([('ember','Warm grin'),('tide','Freckled calm'),('volt','Raised-brow smirk')]):make_face('face-'+style,label,i,'face-collection-02.png')
