"""Isolated hair authoring views, executed after collection_review.py.

The packed image guides are generated concept references. Rendered evidence is
captured from the actual asset geometry, on an untextured neutral head, using the
same orthographic scale for every style and view.
"""

HAIR_REVIEW_SCALE = 1.05
HAIR_REVIEW_VIEWS = ('front', 'side', 'back', 'top')
HAIR_REFERENCE_DIRECTORY = ROOT / 'docs/references/hair-isolated'
HAIR_EVIDENCE_DIRECTORY = ROOT / 'docs/evidence/hair-isolated'

hair_previews = {}
hair_cameras = {}
hair_reference_guides = {}

HAIR_REVIEW_COLORS={**COLLECTION_COLORS,**{style:{'hair':spec['color']} for style,spec in HAIR_03.items()}}
for index, (style, colors) in enumerate(HAIR_REVIEW_COLORS.items()):
    # Keep this inspection row separate from the full-character study rows.
    x = (index - (len(HAIR_REVIEW_COLORS)-1)*.5) * 2.8
    depth = -6.0
    head_height = positions['head'].y
    root = preview(
        'Isolated hair · ' + style,
        ['head-scout', 'hair-' + style],
        x,
        grey=True,
        colors={'hair': colors['hair']},
    )
    root.location.y = -depth
    root['reviewPurpose'] = 'Actual exported hair geometry on a neutral fitting head'
    hair_previews[style] = root

    reference = bpy.data.images.load(
        str(HAIR_REFERENCE_DIRECTORY / (style + '.png')),
        check_existing=True,
    )
    reference.pack()
    guide = empty(style.title() + ' · isolated hair concept · FRONT / SIDE / BACK / TOP')
    guide.empty_display_type = 'IMAGE'
    guide.data = reference
    guide.empty_display_size = 2.2
    guide.location = (x, -depth + 1.3, head_height)
    guide.rotation_euler = (math.pi / 2, 0, 0)
    guide.hide_render = True
    guide['referenceKind'] = 'Generated authoring concept; not implemented geometry evidence'
    guide['provenance'] = 'docs/references/hair-isolated/'+('collection-03-provenance.json' if style in HAIR_03 else 'provenance.json')
    guide['sourceReference'] = 'docs/references/hair-isolated/' + style + '.png'
    guide['referenceViews'] = 'Front, strict left-facing side profile, back, top'
    hair_reference_guides[style] = guide

    # Native asset coordinates are Y-up, +Z-forward. The +X side camera makes
    # the visible face point left; the overhead view puts the forehead below.
    target = (x, head_height + .035, depth-.10)
    eyes = {
        'front': (x, target[1], depth + 5),
        'side': (x + 5, target[1], target[2]),
        'back': (x, target[1], depth - 5),
        'top': (x, head_height + 5, target[2]),
    }
    for view in HAIR_REVIEW_VIEWS:
        data = bpy.data.cameras.new(style.title() + ' · isolated hair · ' + view)
        cam = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(cam)
        cam.location = co(eyes[view])
        cam.rotation_euler = (
            Vector(co(target)) - cam.location
        ).to_track_quat('-Z', 'Y').to_euler()
        data.type = 'ORTHO'
        data.ortho_scale = HAIR_REVIEW_SCALE
        cam['reviewView'] = view
        cam['worldUnitsAcrossImage'] = HAIR_REVIEW_SCALE
        hair_cameras[(style, view)] = cam


def render_hair_views(styles=None, views=None):
    """Write repeatable geometry comparisons without altering the working view.

    Optional style/view subsets support fast sculpt-and-review iterations. An
    empty subset produces no images. The default captures all twenty-four views.
    Every camera uses the same 1.05-unit square frame: no per-model zoom hides a
    silhouette or volume mismatch.
    """
    selected_styles = tuple(hair_previews) if styles is None else tuple(styles)
    selected_views = HAIR_REVIEW_VIEWS if views is None else tuple(views)
    unknown_styles = set(selected_styles) - set(hair_previews)
    unknown_views = set(selected_views) - set(HAIR_REVIEW_VIEWS)
    if unknown_styles or unknown_views:
        raise ValueError(
            'Unknown hair review selection: styles=' + repr(sorted(unknown_styles))
            + ', views=' + repr(sorted(unknown_views))
        )
    HAIR_EVIDENCE_DIRECTORY.mkdir(parents=True, exist_ok=True)
    review_roots = [study_front, study_side, look_front, look_three, look_side]
    review_roots += list(collection_previews.values()) + list(hair_previews.values())
    review_roots += list(globals().get('novelty_previews',{}).values())
    review_roots += list(globals().get('wield_previews',{}).values())
    visibility = {
        obj: obj.hide_render
        for root in review_roots
        for obj in [root, *root.children_recursive]
    }
    previous = {
        'camera': scene.camera,
        'resolution_x': scene.render.resolution_x,
        'resolution_y': scene.render.resolution_y,
        'resolution_percentage': scene.render.resolution_percentage,
        'filepath': scene.render.filepath,
        'file_format': scene.render.image_settings.file_format,
        'samples': scene.cycles.samples,
        'world_color': tuple(scene.world.node_tree.nodes.get('Background').inputs[0].default_value),
        'world_strength': scene.world.node_tree.nodes.get('Background').inputs[1].default_value,
    }
    rendered = {}
    try:
        for obj in visibility:
            obj.hide_render = True
        scene.render.resolution_x = 768
        scene.render.resolution_y = 768
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        scene.cycles.samples = 24
        scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (.91, .886, .824, 1)
        scene.world.node_tree.nodes.get('Background').inputs[1].default_value = 1
        for style in selected_styles:
            root = hair_previews[style]
            for obj in [root, *root.children_recursive]:
                obj.hide_render = visibility[obj]
            for view in selected_views:
                scene.camera = hair_cameras[(style, view)]
                path = HAIR_EVIDENCE_DIRECTORY / ('blender-' + style + '-' + view + '.png')
                scene.render.filepath = str(path)
                bpy.context.view_layer.update()
                bpy.ops.render.render(write_still=True)
                rendered[(style, view)] = str(path)
            for obj in [root, *root.children_recursive]:
                obj.hide_render = True
    finally:
        for obj, hidden in visibility.items():
            obj.hide_render = hidden
        scene.camera = previous['camera']
        scene.render.resolution_x = previous['resolution_x']
        scene.render.resolution_y = previous['resolution_y']
        scene.render.resolution_percentage = previous['resolution_percentage']
        scene.render.filepath = previous['filepath']
        scene.render.image_settings.file_format = previous['file_format']
        scene.cycles.samples = previous['samples']
        scene.world.node_tree.nodes.get('Background').inputs[0].default_value = previous['world_color']
        scene.world.node_tree.nodes.get('Background').inputs[1].default_value = previous['world_strength']
        bpy.context.view_layer.update()
    return rendered
