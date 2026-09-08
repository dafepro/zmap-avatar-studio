"""Separate, optional handheld catalog; shared scene, grip contract and exporter."""
from mathutils import Matrix
exec(compile((ROOT/'assets/source/wield_grip.py').read_text(),'wield_grip.py','exec'),globals())
exec(compile((ROOT/'assets/source/wield_items.py').read_text(),'wield_items.py','exec'),globals())
WIELD_ITEMS={'bubble':('wield-bubble-comet','Bubble Comet','bubble-comet'),
             'bonk':('wield-bonk-bouquet','Bonk Bouquet','bonk-bouquet'),
             'lantern':('wield-firefly-lantern','Firefly Lantern','firefly-lantern'),
             'marker':('wield-doodle-rocket','Doodle Rocket','doodle-rocket'),
             'pinwheel':('wield-whirl-pop','Whirl Pop','whirl-pop')}
wield_roots={};wield_previews={};wield_cameras={}
previous_exports=(OUT,assets,roots)
OUT=ROOT/'public/wield/models';OUT.mkdir(parents=True,exist_ok=True);assets=[];roots=[]
wield_catalog={'version':1,'id':'zoomap-playful-hands','revision':'1.0.0','rig':'athlete-reference-v2','grips':{},'items':[]}
def wield_content(record):
    return {**{key:record[key] for key in ('id','label','url','bytes','sha256','triangles')},'node':record['attachments'][0]['node']}
try:
    for hand in ('left','right'):
        root,record=asset('grip-'+hand,'Power grip · '+hand,'body','Shared gripping hand')
        parent=mount(root,record,'root');built=build_grip_hand(parent,hand)
        # Consolidate only this static hand; retain explicit replacement extras.
        group=[obj for obj in built['root'].children if obj.type=='MESH']
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:obj.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        if len(group)>1:bpy.ops.object.join()
        export(root,record);wield_roots[hand]=root
        frame=built['grip']
        wield_catalog['grips'][hand]={**wield_content(record),'hand':hand,'frame':{'position':frame['center'],'rotation':frame['rotationXYZ']}}
    for key,(identifier,label,behavior) in WIELD_ITEMS.items():
        root,record=asset(identifier,label,'wield','Original playful handheld item')
        parent=mount(root,record,'root');anchors=build_wield_item(key,parent)
        export(root,record);wield_roots[key]=root
        poses={}
        for hand,sign in [('left',-1),('right',1)]:
            poses[hand]={'arm':[-.10,0,sign*.10],'forearm':[-1.15,0,0],'wrist':[0,-sign*math.pi/2,0]}
            if key=='lantern':
                # Counter the relaxed carrying arm, keeping the lantern down
                # under its handle. Opposite hands see opposite authored faces.
                poses[hand]={'arm':[-.06,0,sign*.16],'forearm':[-.22,0,0],
                             'wrist':[.2792354400,-sign*.0095535033,-sign*.1597169621]}
        wield_catalog['items'].append({**wield_content(record),'behavior':behavior,
          'gripAnchor':anchors['grip'].name,'anchors':{name:obj.name for name,obj in anchors.items() if name!='grip'},'pose':poses})
    (ROOT/'public/wield/catalog.json').write_text(json.dumps(wield_catalog,indent=2)+'\n')
finally:
    OUT,assets,roots=previous_exports

def wield_clone(source,parent):
    copy=source.copy();copy.hide_render=False;copy.hide_viewport=False;copy.hide_set(False)
    scene.collection.objects.link(copy);copy.parent=parent
    if copy.type=='MESH':
        copy.data=source.data.copy()
        for index,material in enumerate(copy.data.materials):
            shaded=material.copy()
            if copy.data.color_attributes:shaded['vertexPigment']=copy.data.color_attributes[0].name
            copy.data.materials[index]=toon(shaded)
    for child in source.children:wield_clone(child,copy)
    if copy.type=='MESH':outline_copy(copy)
    return copy

for index,(key,root) in enumerate(wield_roots.items()):
    preview_root=empty('Wield study · '+key);preview_root.location=co(((index-3)*1.2,1,-7))
    wield_clone(root,preview_root);wield_previews[key]=preview_root
    if key in WIELD_ITEMS:
        ref=bpy.data.images.load(str(ROOT/'docs/references/wield'/(key+'.png')),check_existing=True);ref.pack()
        guide=empty('Wield concept · '+key);guide.empty_display_type='IMAGE';guide.data=ref;guide.empty_display_size=.85
        guide.location=preview_root.location+Vector((0,1,.2));guide.rotation_euler=(math.pi/2,0,0);guide.hide_render=True
        guide['referenceKind']='Generated authoring reference, not geometry evidence';guide['provenance']='docs/references/wield/provenance.json'
    else:
        # An exact-radius bar makes the shared grip opening reviewable in 3D.
        bar_root=empty('Measured grip bar '+key,preview_root)
        frame=power_grip_frame(key);basis=Matrix(frame['basis']).transposed().to_4x4();basis.translation=Vector(frame['center'])
        convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
        bar_root.matrix_local=convert@basis@convert.inverted()
        bar=section('20mm grip gauge '+key,[(-.075,0,0,.020,.020),(.075,0,0,.020,.020)],mat('Gauge teal '+key,'#328d8b'),bar_root,n=12)
        for i,m in enumerate(bar.data.materials):bar.data.materials[i]=toon(m)
        outline_copy(bar)
    target=Vector(((index-3)*1.2,1+(-.15 if key=='lantern' else -.06 if key in ('left','right') else .13),-7))
    scale=.60 if key in WIELD_ITEMS else .27
    for view,delta in {'front':(0,0,4),'side':(4,0,0),'back':(0,0,-4),'top':(0,4,0)}.items():
        data=bpy.data.cameras.new('Wield · '+key+' · '+view);cam=bpy.data.objects.new(data.name,data);scene.collection.objects.link(cam)
        cam.location=co(target+Vector(delta));cam.rotation_euler=(Vector(co(target))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=scale
        wield_cameras[(key,view)]=cam
for root in wield_roots.values():
    for obj in [root,*root.children_recursive]:obj.hide_set(True)

def render_wield_views(keys=None):
    selected=tuple(wield_previews) if keys is None else tuple(keys)
    if set(selected)-set(wield_previews):raise ValueError('Unknown wield study')
    output=ROOT/'docs/evidence/wield';output.mkdir(parents=True,exist_ok=True)
    review_roots=[study_front,study_side,look_front,look_three,look_side,*collection_previews.values(),*hair_previews.values(),*novelty_previews.values(),*wield_previews.values()]
    visibility={obj:obj.hide_render for root in review_roots for obj in [root,*root.children_recursive]}
    previous=(scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage,scene.render.filepath)
    paths=[]
    try:
        for obj in visibility:obj.hide_render=True
        scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100
        for key in selected:
            for obj in [wield_previews[key],*wield_previews[key].children_recursive]:obj.hide_render=visibility[obj]
            for view in ('front','side','back','top'):
                path=output/('blender-'+key+'-'+view+'.png');scene.camera=wield_cameras[(key,view)];scene.render.filepath=str(path)
                bpy.context.view_layer.update();bpy.ops.render.render(write_still=True);paths.append(str(path))
            for obj in [wield_previews[key],*wield_previews[key].children_recursive]:obj.hide_render=True
    finally:
        for obj,value in visibility.items():obj.hide_render=value
        scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage,scene.render.filepath=previous
    return paths
