"""Packed concept sheets and fixed orthographic inspection cameras.

Source models remain hidden. Collection previews sit behind the original study
lineup; cameras isolate one model. Image empties are viewport-only references.
"""
COLLECTION_COLORS={
 'ember':{'primary':'#cf641e','skin':'#9e6542','hair':'#514030','secondary':'#292b2d','trim':'#f5f2eb'},
 'tide':{'primary':'#28847f','skin':'#bc8565','hair':'#182b35','secondary':'#292b2d','trim':'#f5f2eb'},
 'volt':{'primary':'#79283a','skin':'#e5b48c','hair':'#bb9964','secondary':'#292b2d','trim':'#f5f2eb'}}
collection_previews={};collection_cameras={}
for index,(style,colors) in enumerate(COLLECTION_COLORS.items()):
    x=(index-1)*2.8
    root=preview('Collection 02 · '+style,['body-athletic','head-scout','face-'+style,'hair-'+style,'shirt-'+style,'bottom-court','shoes-court'],x,colors=colors)
    root.location.y=3;collection_previews[style]=root
    reference=bpy.data.images.load(str(ROOT/'docs/references/collection-02'/f'{style}.png'),check_existing=True);reference.pack()
    guide=empty(style.title()+' · FRONT / SIDE / TOP concept');guide.empty_display_type='IMAGE';guide.data=reference;guide.empty_display_size=2.5;guide.location=(x,4,1.2);guide.rotation_euler=(math.pi/2,0,0);guide.hide_render=True
    guide['referenceViews']='Front, strict side profile, overhead crown and elevated full figure';guide['provenance']='Built-in imagegen; exact prompt saved beside source concept'
    for view,eye,target,scale in [('front',(x,1.13,4),(x,1.13,-3),2.35),('side',(x+7,1.13,-3),(x,1.13,-3),2.35),('top',(x,7,-3),(x,1.10,-3),1.12),('back',(x,1.85,-10),(x,1.80,-3),.90),('rear-oblique',(x+4,2.5,-8),(x,1.80,-3),.90)]:
        data=bpy.data.cameras.new(style.title()+' · '+view);cam=bpy.data.objects.new(data.name,data);scene.collection.objects.link(cam);cam.location=co(eye);cam.rotation_euler=(Vector(co(target))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=scale;collection_cameras[(style,view)]=cam

def render_collection_views():
    """Capture every sheet view without neighboring models occluding profiles."""
    review_roots=[study_front,study_side,look_front,look_three,look_side]+list(collection_previews.values())+list(globals().get('hair_previews',{}).values())
    visibility={o:o.hide_render for root in review_roots for o in root.children_recursive}
    previous=(scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.filepath,scene.cycles.samples)
    try:
        for obj in visibility:obj.hide_render=True
        scene.render.resolution_x=600;scene.render.resolution_y=760;scene.cycles.samples=16
        for style,root in collection_previews.items():
            for obj in root.children_recursive:obj.hide_render=visibility[obj]
            for view in ['front','side','top','back','rear-oblique']:
                scene.camera=collection_cameras[(style,view)]
                scene.render.filepath=str(ROOT/f'docs/evidence/collection-02/blender-{style}-{view}.png')
                bpy.ops.render.render(write_still=True)
            for obj in root.children_recursive:obj.hide_render=True
    finally:
        for obj,hidden in visibility.items():obj.hide_render=hidden
        scene.camera,scene.render.resolution_x,scene.render.resolution_y,scene.render.filepath,scene.cycles.samples=previous
