"""Three restrained two-handed action devices, authored from action concepts.

Execute in reference_kit globals. All dimensions are metres in item-local Y-up,
+Z-front coordinates. The carrying datum is the origin; physical grip axes are
vertical at X ±.21, Y0, Z0. Each grip has an uninterrupted 110mm palm zone and a
20mm radius. No export, camera, pose, or world behavior is owned by this file.
Generated concept artwork is an authoring reference, never geometric evidence.
"""


def _action_anchor(key, name, parent, position=(0, 0, 0)):
    anchor = empty(key + '__' + name, parent)
    anchor.location = co(position)
    anchor['wieldAnchor'] = name
    return anchor


def _action_prism(name, outline, rows, material, parent, center=(0, 0)):
    """Closed bevelled XY plate: (scale,Z) rings share all boundary vertices."""
    cx, cy = center
    vertices = [(cx + (x-cx)*scale, cy + (y-cy)*scale, z)
                for scale, z in rows for x, y in outline]
    count = len(outline)
    faces = [tuple(reversed(range(count))),
             tuple(range((len(rows)-1)*count, len(rows)*count))]
    for row in range(len(rows)-1):
        for i in range(count):
            a = row*count+i
            b = row*count+(i+1) % count
            faces.append((a, b, b+count, a+count))
    return mesh(name, vertices, faces, material, parent)


def _action_octagon(cx, cy, width, height, corner):
    x = width/2
    y = height/2
    return [(cx-x+corner, cy-y), (cx+x-corner, cy-y),
            (cx+x, cy-y+corner), (cx+x, cy+y-corner),
            (cx+x-corner, cy+y), (cx-x+corner, cy+y),
            (cx-x, cy+y-corner), (cx-x, cy-y+corner)]


def _action_plate(name, center, size, material, parent, bevel=.008):
    x, y, z = center
    width, height, depth = size
    outline = _action_octagon(x, y, width, height, min(bevel, width*.12, height*.12))
    return _action_prism(name, outline, [(1, z-depth/2), (1, z+depth/2)],
                         material, parent, (x, y))


def _action_axle(name, rows, axis, center, material, parent, count=12):
    """Cylinder/stepped drum with longitudinal axis X, Y or Z; no reflections."""
    vertices = []
    for along, radius in rows:
        for i in range(count):
            angle = i*math.tau/count
            a, b = radius*math.cos(angle), radius*math.sin(angle)
            point = (along, a, b) if axis == 'x' else ((b, along, a) if axis == 'y' else (a, b, along))
            vertices.append(tuple(point[j]+center[j] for j in range(3)))
    faces = [tuple(reversed(range(count))),
             tuple(range((len(rows)-1)*count, len(rows)*count))]
    for row in range(len(rows)-1):
        for i in range(count):
            a = row*count+i
            b = row*count+(i+1) % count
            faces.append((a, b, b+count, a+count))
    return mesh(name, vertices, faces, material, parent)


def _action_handles(key, parent, materials, support_z=.13, support_width=.056):
    """One invariant pair. Supports stay outside the measured finger zone."""
    anchors = {}
    for side, sign in [('Left', -1), ('Right', 1)]:
        x = sign*.21
        bar = _action_axle(key+' '+side+' unobstructed palm bar', [(-.065, .020), (.065, .020)],
                           'y', (x, 0, 0), materials['grip'], parent, 8)
        bar['gripRadius'] = .020
        bar['gripClearLength'] = .11
        bar['gripSide'] = side.lower()
        for y in (-.078, .078):
            _action_plate(key+' '+side+' finger-safe handle mount', (x, y, support_z/2),
                          (support_width, .026, support_z+.036), materials['charcoal'], parent, .008)
        anchors['grip'+side] = _action_anchor(key, 'grip'+side, parent, (x, 0, 0))
    return anchors


def _action_pigment(obj, values=None):
    if obj.data.color_attributes:
        return
    attribute = obj.data.color_attributes.new(name='Original pigment', type='FLOAT_COLOR', domain='CORNER')
    for polygon in obj.data.polygons:
        for loop in polygon.loop_indices:
            value = 1 if values is None else values[obj.data.loops[loop].vertex_index]
            attribute.data[loop].color = (value, value, value, 1)


def _action_winch(parent, m):
    # Width provides a real overlap with the narrow cage at upper mount height.
    anchors = _action_handles('Winch', parent, m, .145, .064)
    spool = _action_anchor('Winch', 'spool', parent, (0, .008, .178))
    anchors['spool'] = spool
    # A single welded corrugated drum is the actual wound cable, not a stack of
    # overlapping torus meshes. Broad facets stay legible at avatar scale.
    rows = [(-.103 + .206*i/16, .147 if i % 2 == 0 else .158) for i in range(17)]
    cable = _action_axle('Winch eight closely wound cable turns', rows, 'x', (0, 0, 0), m['blue'], spool, 12)
    _action_pigment(cable, [(.84 if i % 2 == 0 else 1) * (.91 + .09*math.cos(j*math.tau/12))
                           for i in range(17) for j in range(12)])
    for sign in (-1, 1):
        # The cable ends at ±.103; cheeks overlap it instead of hovering 4mm away.
        low, high = sorted((sign*.101, sign*.131))
        _action_axle('Winch thick octagonal reel cheek', [(low, .162), (low+.004, .176),
                         (high-.004, .176), (high, .162)], 'x', (0, 0, 0), m['charcoal'], spool, 10)
        low, high = sorted((sign*.131, sign*.145))
        _action_axle('Winch exposed reel hub', [(low, .036), (high, .036)], 'x', (0, 0, 0), m['metal'], spool, 8)
        # The enclosing ivory rails lean forward from their narrow top into the
        # lower guard. Their inner opening leaves most of the cable visible.
        shape = [(sign*x, y) for x, y in [(.108, .197), (.157, .197), (.178, .105),
                  (.196, -.172), (.147, -.208), (.116, -.153), (.138, -.094), (.125, .080)]]
        if sign < 0:
            shape.reverse()
        _action_prism('Winch ivory side cage', shape,
                      [(1, .112), (1, .269)], m['ivory'], parent)
        _action_plate('Winch lower cage shoe', (sign*.158, -.203, .195), (.078, .039, .186), m['charcoal'], parent, .010)
        # The narrow side latch sits on the rail's front plane; no floating decal.
        _action_plate('Winch inset rail latch', (sign*.170, -.141, .270), (.015, .043, .002), m['charcoal'], parent, .003)
    _action_plate('Winch top housing', (0, .179, .232), (.244, .060, .097), m['ivory'], parent, .016)
    _action_plate('Winch amber readout socket', (0, .184, .282), (.156, .021, .003), m['charcoal'], parent, .005)
    _action_plate('Winch amber status bar', (0, .185, .284), (.132, .011, .002), m['amber'], parent, .003)
    _action_plate('Winch rear lower chassis', (0, -.186, .120), (.320, .061, .061), m['ivory'], parent, .016)
    _action_plate('Winch rear service recess', (0, -.184, .088), (.132, .027, .003), m['charcoal'], parent, .009)
    tube('Winch forward horseshoe fairlead', [(-.098, -.117, .313), (-.098, -.198, .331),
         (-.063, -.224, .339), (.063, -.224, .339), (.098, -.198, .331), (.098, -.117, .313)],
         .019, m['metal'], parent, n=4)
    tube('Winch seated blue cable leader', [(0, -.135, .244), (0, -.184, .320), (0, -.192, .387)],
         .012, m['blue'], parent, n=6)
    anchors['cable'] = _action_anchor('Winch', 'cable', parent, (0, -.192, .387))
    return anchors


def _action_clip_x(polygon, boundary, above):
    clipped = []
    for a, b in zip(polygon, polygon[1:]+polygon[:1]):
        av, bv = a[0]-boundary, b[0]-boundary
        ai, bi = (av >= -1e-9, bv >= -1e-9) if above else (av <= 1e-9, bv <= 1e-9)
        if ai:
            clipped.append(a)
        if ai != bi:
            t = av/(av-bv)
            clipped.append((a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t))
    return clipped


def _action_panel_z(x):
    return .205 - .087*(x/.39)**2


def _action_panel_patch(name, polygon, material, parent, offset=.001):
    # The paint is split at every shell facet and lies on its exact plane, so
    # blue/amber marks cannot float above or cut through the convex panel.
    stations = [-.39, -.30, -.18, 0, .18, .30, .39]
    vertices, faces = [], []
    for lo, hi in zip(stations, stations[1:]):
        points = _action_clip_x(_action_clip_x(polygon, lo, True), hi, False)
        if len(points) < 3:
            continue
        if sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(points, points[1:]+points[:1])) < 0:
            points.reverse()
        start = len(vertices)
        for x, y in points:
            t = (x-lo)/(hi-lo)
            z = _action_panel_z(lo)*(1-t)+_action_panel_z(hi)*t
            vertices.append((x, y, z+offset))
        faces.append(tuple(range(start, len(vertices))))
    return mesh(name, vertices, faces, material, parent)


def _action_panel(parent, m):
    anchors = _action_handles('Panel', parent, m, .145)
    # Closed shell with an actual convex front and constant 38mm thickness.
    columns = [-.39, -.30, -.18, 0, .18, .30, .39]
    rows = [-.285, -.222, 0, .222, .285]
    vertices = []
    for back in (False, True):
        for j, y in enumerate(rows):
            for i, x in enumerate(columns):
                px = math.copysign(.337, x) if j in (0, 4) and i in (0, 6) else x
                # Broad upper/lower curves produce the study's bowed outline.
                py = y - math.copysign(.024*(1-(abs(x)/.39)), y) if j in (0, 4) else y
                vertices.append((px, py, _action_panel_z(px)-(.038 if back else 0)))
    n = len(columns)*len(rows)
    faces = []
    for back in (False, True):
        for j in range(4):
            for i in range(6):
                a = j*7+i + (n if back else 0)
                face = (a, a+1, a+8, a+7)
                faces.append(tuple(reversed(face)) if back else face)
    boundary = list(range(7)) + [j*7+6 for j in range(1, 5)] + list(range(33, 27, -1)) + [j*7 for j in range(3, 0, -1)]
    for a, b in zip(boundary, boundary[1:]+boundary[:1]):
        faces.append((a+n, b+n, b, a))
    shell = mesh('Panel continuous convex impact shell', vertices, faces, m['ivory'], parent)
    shell.data.materials.append(m['charcoal'])
    for polygon in shell.data.polygons:
        if polygon.index >= 24:
            polygon.material_index = 1
    # An authored border follows the shell edge, rather than a flat rectangle
    # sitting across the curve. Back reinforcement uses the same bent datum.
    front_edge = [vertices[i] for i in boundary]
    tube('Panel dark protected perimeter', front_edge+[front_edge[0]], .014, m['charcoal'], parent, n=4)
    for sign in (-1, 1):
        arrow = [(sign*x, y) for x, y in [(.319, .170), (.277, .205), (.120, 0),
                 (.277, -.205), (.319, -.170), (.199, 0)]]
        _action_panel_patch('Panel inset steel blue chevron', arrow, m['blue'], parent)
        # Only three controlled section lines, avoiding noisy triangle outlines.
        for x in (sign*.18, sign*.30):
            _action_panel_patch('Panel joined face section', [(x-.0008, -.235), (x+.0008, -.235),
                                (x+.0008, .235), (x-.0008, .235)], m['metal'], parent, .0005)
        for y in (-.223, .223):
            x = sign*.333
            _action_plate('Panel reinforced corner bumper', (x, y, _action_panel_z(x)+.002),
                          (.100, .105, .050), m['charcoal'], parent, .025)
        _action_plate('Panel edge amber witness mark', (sign*.377, 0, _action_panel_z(.377)+.004),
                      (.010, .051, .012), m['amber'], parent, .002)
    _action_panel_patch('Panel broad amber impact belt', [(-.120, -.037), (.120, -.037), (.120, .037), (-.120, .037)], m['amber'], parent)
    # Broad rear V braces are closed supports, leaving both hand pockets clear.
    for sign in (-1, 1):
        # Follow the exact shell facet stations; the 9mm rods overlap the rear
        # plate by 2mm instead of floating behind an approximate bowed path.
        diagonal = [(sign*x, sign*y, _action_panel_z(x)-.038-.007)
                    for x, y in [(0, 0), (.18, .12), (.30, .20)]]
        opposing = [(x, -y, z) for x, y, z in diagonal]
        tube('Panel rear diagonal reinforcement', diagonal, .009, m['metal'], parent, n=4)
        tube('Panel rear opposing reinforcement', opposing, .009, m['metal'], parent, n=4)
    anchors['face'] = _action_anchor('Panel', 'face', parent, (0, 0, .205))
    anchors['impact'] = _action_anchor('Panel', 'impact', parent, (0, 0, .207))
    return anchors


def _action_driver(parent, m):
    # The rear handle faces remain clear; pale structural mounts visually join
    # the grip loops to the angular shoulder shell in every reference view.
    handle_materials = dict(m)
    handle_materials['charcoal'] = m['ivory']
    anchors = _action_handles('Driver', parent, handle_materials, .135)
    # Depth standoffs alone would leave this narrow tower's handles floating.
    # The four transverse bridges overlap the central casing and the full
    # depth standoffs, closing a real load path outside the protected palm zone.
    for sign in (-1, 1):
        for y in (-.078, .078):
            _action_plate('Driver transverse ivory handle bridge', (sign*.150, y, .137),
                          (.158, .026, .044), m['ivory'], parent, .008)
    section('Driver long octagonal actuator housing', [(-.198, 0, .15, .108, .100),
            (.030, 0, .15, .108, .100), (.178, 0, .15, .142, .127), (.220, 0, .15, .093, .093)], m['charcoal'], parent, n=8)
    for sign in (-1, 1):
        outline = [(sign*x, y) for x, y in [(.045, .217), (.091, .235), (.145, .175),
                   (.151, .092), (.088, .015), (.070, .083)]]
        if sign < 0:
            outline.reverse()
        _action_prism('Driver angular ivory shoulder armor', outline, [(1, .063), (1, .247)], m['ivory'], parent)
    _action_plate('Driver front recessed control strip', (0, .088, .265), (.061, .170, .040), m['metal'], parent, .007)
    _action_plate('Driver amber charge cell', (0, .125, .287), (.026, .054, .004), m['amber'], parent, .003)
    _action_plate('Driver rear service cover', (0, -.045, .048), (.079, .185, .005), m['metal'], parent, .007)
    piston = _action_anchor('Driver', 'piston', parent, (0, -.190, .15))
    anchors['piston'] = piston
    # The foot and piston move together; the stationary housing is a separate
    # parent mesh. Three longitudinal bands visibly explain the motion axis.
    section('Driver guided lower piston', [(-.155, 0, 0, .106, .094), (-.010, 0, 0, .106, .094),
             (.026, 0, 0, .097, .086)], m['charcoal'], piston, n=8)
    for y in (-.046, -.094):
        section('Driver steel blue compression band', [(y-.010, 0, 0, .115, .103),
                (y+.010, 0, 0, .115, .103)], m['blue'], piston, n=8)
    foot = section('Driver broad blunt octagonal ground pad', [(-.240, 0, 0, .350, .225),
             (-.194, 0, 0, .350, .225), (-.135, 0, 0, .252, .158), (-.119, 0, 0, .175, .123)], m['charcoal'], piston, n=8)
    foot.data.materials.append(m['ivory'])
    for polygon in foot.data.polygons:
        # Cap order precedes side rings in the shared section helper.
        if 10 <= polygon.index < 26:
            polygon.material_index = 1
    for sign in (-1, 1):
        # Clip the painted vent against each actual surface triangle. Merely
        # projecting four corners would cut through the change of slope.
        x0, x1 = sign*.135, sign*.214
        shape = [(x0, -.211), (x1, -.211), (x1*.83, -.157), (x0*.83, -.157)]
        if sign < 0:
            shape.reverse()
        _action_front_paint('Driver sloped front vent', shape, foot, m['metal'], piston)
    anchors['ground'] = _action_anchor('Driver', 'ground', piston, (0, -.240, 0))
    return anchors


def _action_front_paint(name, outline, surface, material, parent):
    """Exact triangle-clipped surface paint, with no crossing of facet breaks."""
    vertices, faces = [], []
    source = [Vector((v.co.x, v.co.z, -v.co.y)) for v in surface.data.vertices]
    surface.data.calc_loop_triangles()
    for triangle in surface.data.loop_triangles:
        a, b, c = [source[i] for i in triangle.vertices]
        normal = (b-a).cross(c-a)
        if normal.z <= 1e-10:
            continue
        points = list(outline)
        for edge_a, edge_b in ((a, b), (b, c), (c, a)):
            def distance(point):
                return ((edge_b.x-edge_a.x)*(point[1]-edge_a.y) -
                        (edge_b.y-edge_a.y)*(point[0]-edge_a.x))
            clipped = []
            for p, q in zip(points, points[1:]+points[:1]):
                pd, qd = distance(p), distance(q)
                if pd >= -1e-10:
                    clipped.append(p)
                if (pd >= -1e-10) != (qd >= -1e-10):
                    t = pd/(pd-qd)
                    clipped.append((p[0]+(q[0]-p[0])*t, p[1]+(q[1]-p[1])*t))
            points = clipped
            if not points:
                break
        if len(points) < 3:
            continue
        area = sum(p[0]*q[1]-q[0]*p[1] for p, q in zip(points, points[1:]+points[:1]))
        if abs(area) < 1e-10:
            continue
        if area < 0:
            points.reverse()
        start = len(vertices)
        for x, y in points:
            z = a.z - (normal.x*(x-a.x)+normal.y*(y-a.y))/normal.z
            vertices.append((x, y, z+.0008))
        faces.append(tuple(range(start, len(vertices))))
    if not faces:
        raise ValueError('Action artwork missed its authored surface')
    return mesh(name, vertices, faces, material, parent)


def _action_consolidate(parent, name):
    pieces = [obj for obj in parent.children if obj.type == 'MESH']
    if not pieces:
        return
    for obj in pieces:
        _action_pigment(obj)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    if len(pieces) > 1:
        bpy.ops.object.join()
    pieces[0].name = name


def build_action_item(key, parent):
    builders = {'winch': _action_winch, 'panel': _action_panel, 'driver': _action_driver}
    if key not in builders:
        raise ValueError('Unknown action concept: '+str(key))
    palette = {'ivory': '#E9E5D9', 'charcoal': '#303536', 'grip': '#272D2E',
               'metal': '#51595D', 'blue': '#4D82A3', 'amber': '#D9A64C'}
    materials = {name: mat('Action '+key+' original '+name, value) for name, value in palette.items()}
    anchors = builders[key](parent, materials)
    for name in ('spool', 'piston'):
        if name in anchors:
            _action_consolidate(anchors[name], key+'__'+name+'_mesh')
    _action_consolidate(parent, key+'__static_mesh')
    # Grip node matrices are pure translations. These names are provided
    # separately so exporters keep grip mappings out of auxiliary anchors.
    return anchors
