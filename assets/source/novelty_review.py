"""Packed four-view novelty references and isolated actual-geometry cameras."""
novelty_previews={};novelty_cameras={}
NOVELTY_REVIEW={
    'quack':{'ids':['head-scout','hat-quack-captain'],'target':(0,2.00,-.01),'scale':1.18},
    'starstruck':{'ids':['head-scout','acc-starstruck'],'target':(0,1.815,.015),'scale':.68},
    'galaxy':{'ids':['body-athletic','bottom-court','shoes-court','effect-pocket-galaxy'],'target':(0,.35,0),'scale':2.12},
}
for index,(style,spec) in enumerate(NOVELTY_REVIEW.items()):
    x=(index-1)*2.8;depth=-4.5
    root=preview('Novelty study · '+style,spec['ids'],x,grey=True,
                 colors={'primary':'#b9b9b6','secondary':'#777873','trim':'#cdccc7'})
    root.location.y=-depth;novelty_previews[style]=root
    root['reviewPurpose']='Actual source geometry; runtime fitting qualified separately'
    ref=bpy.data.images.load(str(ROOT/'docs/references/novelty'/(style+'.png')),check_existing=True);ref.pack()
    guide=empty('Novelty concept · '+style+' · FRONT SIDE BACK TOP')
    guide.empty_display_type='IMAGE';guide.data=ref;guide.empty_display_size=2.2
    guide.location=(x,-depth+1.3,1.8);guide.rotation_euler=(math.pi/2,0,0);guide.hide_render=True
    guide['referenceKind']='Generated authoring concept, not geometry evidence'
    guide['provenance']='docs/references/novelty/provenance.json'
    target=(x,spec['target'][1],depth+spec['target'][2])
    eyes={'front':(x,target[1],target[2]+5),'side':(x+5,target[1],target[2]),
          'back':(x,target[1],target[2]-5),'top':(x,target[1]+5,target[2])}
    for view,eye in eyes.items():
        data=bpy.data.cameras.new('Novelty · '+style+' · '+view)
        camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
        camera.location=co(eye);camera.rotation_euler=(Vector(co(target))-camera.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO';data.ortho_scale=spec['scale'];novelty_cameras[(style,view)]=camera


def render_novelty_views(styles=None):
    selected=tuple(novelty_previews) if styles is None else tuple(styles)
    if set(selected)-set(novelty_previews):raise ValueError('Unknown novelty style')
    output=ROOT/'docs/evidence/novelty';output.mkdir(parents=True,exist_ok=True)
    review_roots=[study_front,study_side,look_front,look_three,look_side]
    review_roots+=list(collection_previews.values())+list(hair_previews.values())+list(novelty_previews.values())
    visibility={o:o.hide_render for root in review_roots for o in [root,*root.children_recursive]}
    previous=(scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage,
              scene.render.filepath,scene.render.image_settings.file_format)
    paths=[]
    try:
        for o in visibility:o.hide_render=True
        scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100
        scene.render.image_settings.file_format='PNG'
        for style in selected:
            root=novelty_previews[style]
            for o in [root,*root.children_recursive]:o.hide_render=visibility[o]
            for view in ('front','side','back','top'):
                path=output/('blender-'+style+'-'+view+'.png');scene.camera=novelty_cameras[(style,view)]
                scene.render.filepath=str(path);bpy.context.view_layer.update();bpy.ops.render.render(write_still=True)
                paths.append(str(path))
            for o in [root,*root.children_recursive]:o.hide_render=True
    finally:
        for o,hidden in visibility.items():o.hide_render=hidden
        scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.resolution_percentage,scene.render.filepath,scene.render.image_settings.file_format=previous
        bpy.context.view_layer.update()
    return paths
