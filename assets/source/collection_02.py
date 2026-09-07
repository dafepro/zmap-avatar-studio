"""Ember, Tide and Volt: independent parts traced from collection-02 sheets.

Executed inside reference_kit.py's authoring context, before accessories. Hair is
one source per style; no hat-specific alternatives. Coordinates are head-local.
"""
for hair_module in ['ember','tide','volt']:
    exec(compile((ROOT/'assets/source'/('hair_'+hair_module+'.py')).read_text(), 'hair_'+hair_module+'.py', 'exec'),globals())

def collection_hair(style, label):
    r,d=asset('hair-'+style,label,'hair','Collection 02: independently authored scalp and directional masses from front, side and overhead concept studies.');p=mount(r,d,'head')
    scalp=scalp_foundation(p,label,nape=-.158 if style=='tide' else -.115,undercut=style in ['ember','volt'],root_pigment=.45 if style=='ember' else .13)
    globals()['build_'+style+'_hair'](p)
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
