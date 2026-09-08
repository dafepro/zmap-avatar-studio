"""Optional field tools: one shared model, two authored physical grip frames."""
import shutil
exec(compile((ROOT/'assets/source/action_items.py').read_text(),'action_items.py','exec'),globals())
ACTION_ITEMS={'winch':('wield-tether-winch','Tether Winch','tether-winch'),
              'panel':('wield-rebound-panel','Rebound Panel','rebound-panel'),
              'driver':('wield-wake-driver','Wake Driver','wake-driver')}
action_roots={};action_previews={};action_cameras={}
previous_exports=(OUT,assets,roots)
OUT=ROOT/'public/action/models';OUT.mkdir(parents=True,exist_ok=True);assets=[];roots=[]
action_catalog={'version':1,'id':'zoomap-field-tools','revision':'1.0.0','rig':'athlete-reference-v2','grips':wield_catalog['grips'],'items':[]}
try:
    for hand in ('left','right'):
        grip=action_catalog['grips'][hand]
        shutil.copyfile(ROOT/'public/wield'/grip['url'],ROOT/'public/action'/grip['url'])
    for key,(identifier,label,behavior) in ACTION_ITEMS.items():
        root,record=asset(identifier,label,'wield','Two-handed field tool')
        parent=mount(root,record,'root');anchors=build_action_item(key,parent)
        export(root,record);action_roots[key]=root
        if record['triangles']>1200:raise ValueError(f'{key} exceeds 1200 triangles: '+str(record['triangles']))
        action_catalog['items'].append({**wield_content(record),'behavior':behavior,
          'gripAnchor':anchors['gripRight'].name,
          'anchors':{name:obj.name for name,obj in anchors.items() if name not in ('gripLeft','gripRight')},
          'pose':{hand:{'arm':[0,0,0],'forearm':[0,0,0],'wrist':[0,0,0]} for hand in ('left','right')},
          'twoHanded':{'grips':{'left':anchors['gripLeft'].name,'right':anchors['gripRight'].name},
                       'hold':{'socket':'chest','position':[0,-.20,.30],'rotation':[0,0,0]}}})
    (ROOT/'public/action/catalog.json').write_text(json.dumps(action_catalog,indent=2)+'\n')
finally:
    OUT,assets,roots=previous_exports

for index,(key,root) in enumerate(action_roots.items()):
    preview_root=empty('Field study · '+key);preview_root.location=co(((index-1)*1.3,1,-9))
    wield_clone(root,preview_root);action_previews[key]=preview_root
    ref=bpy.data.images.load(str(ROOT/'docs/references/action'/(key+'.png')),check_existing=True);ref.pack()
    guide=empty('Field concept · '+key);guide.empty_display_type='IMAGE';guide.data=ref;guide.empty_display_size=1
    guide.location=preview_root.location+Vector((0,1,.2));guide.rotation_euler=(math.pi/2,0,0);guide.hide_render=True
    guide['referenceKind']='Generated authoring reference, not geometry evidence';guide['provenance']='docs/references/action/provenance.json'
    # Geometry-derived bounds keep a long tool or asymmetric housing in frame.
    bpy.context.view_layer.update()
    points=[Vector((v.x,v.z,-v.y)) for obj in preview_root.children_recursive if obj.type=='MESH' and not obj.get('comicOutline') for v in [obj.matrix_world@vert.co for vert in obj.data.vertices]]
    low=Vector(tuple(min(v[i] for v in points) for i in range(3)));high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    target=(low+high)*.5;scale=max(high-low)*1.35
    for view,delta in {'front':(0,0,4),'side':(4,0,0),'back':(0,0,-4),'top':(0,4,0)}.items():
        data=bpy.data.cameras.new('Field · '+key+' · '+view);cam=bpy.data.objects.new(data.name,data);scene.collection.objects.link(cam)
        cam.location=co(target+Vector(delta));cam.rotation_euler=(Vector(co(target))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=scale
        action_cameras[(key,view)]=cam
for root in action_roots.values():
    for obj in [root,*root.children_recursive]:obj.hide_set(True)

def render_action_views(keys=None):
    selected=tuple(action_previews) if keys is None else tuple(keys)
    if set(selected)-set(action_previews):raise ValueError('Unknown field study')
    output=ROOT/'docs/evidence/action';output.mkdir(parents=True,exist_ok=True)
    review_roots=[study_front,study_side,look_front,look_three,look_side,*collection_previews.values(),*hair_previews.values(),*novelty_previews.values(),*wield_previews.values(),*action_previews.values()]
    visibility={obj:obj.hide_render for root in review_roots for obj in [root,*root.children_recursive]}
    previous=(scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage,scene.render.filepath)
    paths=[]
    try:
        for obj in visibility:obj.hide_render=True
        scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100
        for key in selected:
            for obj in [action_previews[key],*action_previews[key].children_recursive]:obj.hide_render=visibility[obj]
            for view in ('front','side','back','top'):
                path=output/('blender-'+key+'-'+view+'.png');scene.camera=action_cameras[(key,view)];scene.render.filepath=str(path)
                bpy.context.view_layer.update();bpy.ops.render.render(write_still=True);paths.append(str(path))
            for obj in [action_previews[key],*action_previews[key].children_recursive]:obj.hide_render=True
    finally:
        for obj,value in visibility.items():obj.hide_render=value
        scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage,scene.render.filepath=previous
    return paths
