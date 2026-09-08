"""One reusable power grip per hand, independent of the held item.

Execute in reference_kit globals, then call build_grip_hand(parent, 'left' or
'right'). All authored coordinates are wrist-socket-local metres, Y-up/+Z-front.
The returned item frame maps an item's +Y handle axis and +Z presentation face
onto the grip without a reflection or negative object scale. No scene is changed
until the builder is called. Export, selection and runtime policy belong to the
caller; the builder produces geometry and a measurable attachment contract only.
"""


def power_grip_frame(side):
    """A fixed .020 m grip radius shared by every compatible item.

    The full finger stack occupies approximately .075 m along the handle; give
    authored handles a clear .11 m grip zone centred at their local origin.
    Matrix columns map item X/Y/Z into wrist-local coordinates. They form a
    right-handed basis for either hand (determinant +1).
    """
    if side not in ('left', 'right'):
        raise ValueError("Grip side must be 'left' or 'right'")
    sign = -1 if side == 'left' else 1
    return {
        'socket': 'hand_L' if sign < 0 else 'hand_R',
        'handSide': side,
        'center': [sign*.024, -.073, .046],
        'radius': .020,
        'clearHandleLength': .11,
        'basis': [[0, 0, -sign], [sign, 0, 0], [0, -1, 0]],
        # THREE.Euler XYZ; also equivalent to Rz(-sign*pi/2)*Ry(sign*pi/2).
        'rotationXYZ': [math.pi/2, 0, -sign*math.pi/2],
        'scale': [1, 1, 1],
    }


def _grip_sweep(name, points, widths, depths, material, parent, side, n=6):
    """Elliptical articulated sweep: narrow across fingers, full knuckle depth.

    A stable cross-finger axis keeps the four curled fingers individually
    readable. Each closed tube is embedded in the palm at its root; the final
    ring tapers into a rounded fingertip instead of a sharp wedge or sphere.
    """
    points = [Vector(point) for point in points]
    vertices = []
    for i, point in enumerate(points):
        tangent = (points[min(i+1, len(points)-1)] -
                   points[max(0, i-1)]).normalized()
        across = Vector((1, 0, 0))
        across -= tangent*across.dot(tangent)
        if across.length < .001:
            across = Vector((0, 1, 0))
            across -= tangent*across.dot(tangent)
        across.normalize()
        radial = tangent.cross(across).normalized()
        for column in range(n):
            angle = column*math.tau/n
            vertices.append(tuple(point + across*(widths[i]*math.cos(angle)) +
                                  radial*(depths[i]*math.sin(angle))))
    faces = [tuple(reversed(range(n)))]
    for row in range(len(points)-1):
        for column in range(n):
            a = row*n+column
            b = row*n+(column+1) % n
            faces.append((a, b, b+n, a+n))
    faces.append(tuple(range((len(points)-1)*n, len(points)*n)))
    obj = mesh(name, vertices, faces, material, parent)
    obj['handSide'] = side
    obj['handPose'] = 'power-grip'
    return planar(obj)


def _finish_grip_volume(root, side, contract):
    """Union anatomical branches before ink rendering; retain a real cavity.

    Intersecting palm/finger/thumb shells each produce their own silhouettes.
    Fine voxel union makes them one surface. Rebuilding the upper wrist ring
    after simplification retains the precise attachment boundary instead of
    relying on a decimator to preserve a tiny cap.
    """
    parts = [obj for obj in root.children if obj.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = parts[0]
    obj.data.remesh_voxel_size = .0015
    obj.data.use_remesh_preserve_volume = True
    bpy.ops.object.voxel_remesh()
    modifier = obj.modifiers.new('Relax fused thumb web', 'SMOOTH')
    modifier.factor = .16
    modifier.iterations = 1
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.calc_loop_triangles()
    modifier = obj.modifiers.new('Connected hand surface budget', 'DECIMATE')
    modifier.ratio = min(1, 430/len(obj.data.loop_triangles))
    bpy.ops.object.modifier_apply(modifier=modifier.name)

    # The collar shares the union's cut boundary, so it introduces no second
    # shell, overlapping cap or silhouette seam. Y-up is Blender local Z here.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                          dist=.000001, plane_co=(0, 0, .002),
                          plane_no=(0, 0, 1), clear_outer=True, clear_inner=False)
    boundary = {v for edge in bm.edges if edge.is_boundary for v in edge.verts
                if abs(v.co.z-.002) < .00001}
    if len(boundary) < 6:
        bm.free()
        raise ValueError('Power grip has no continuous wrist boundary')
    sign = -1 if side == 'left' else 1
    cx = sign*.001
    angle = lambda vertex: math.atan2((vertex.co.x-cx)/.027, -vertex.co.y/.028) % math.tau
    lower = sorted(boundary, key=angle)
    angles = [angle(vertex) for vertex in lower]
    upper = [bm.verts.new(co((cx+.027*math.sin(i*math.tau/8), .015,
                             .028*math.cos(i*math.tau/8)))) for i in range(8)]
    i = j = 0
    while i < len(lower) or j < len(upper):
        next_lower = (angles[(i+1) % len(lower)] +
                      (math.tau if i+1 >= len(lower) else 0)) if i < len(lower) else math.inf
        next_upper = (j+1)*math.tau/8 if j < len(upper) else math.inf
        if next_lower < next_upper:
            bm.faces.new((lower[i % len(lower)], lower[(i+1) % len(lower)], upper[j % 8]))
            i += 1
        else:
            bm.faces.new((lower[i % len(lower)], upper[(j+1) % 8], upper[j % 8]))
            j += 1
    bm.faces.new(upper)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()

    # Voxel smoothing and long decimation edges can tighten a cylindrical hole.
    # Enforce clearance on triangle interiors, not only on their vertices.
    cy, cz = contract['center'][1:]
    required = contract['radius']+.0004
    def radial_distance(points):
        # Projection along the handle axis often collapses a face to a segment;
        # handle that case explicitly instead of dividing by a zero-area normal.
        cross = lambda a, b: a.x*b.y-a.y*b.x
        edges = [(points[i], points[(i+1) % 3]) for i in range(3)]
        signs = [cross(a, b) for a, b in edges]
        area = cross(points[1]-points[0], points[2]-points[0])
        if abs(area) > 1e-12 and (min(signs) >= 0 or max(signs) <= 0):
            return 0
        nearest = math.inf
        for a, b in edges:
            delta = b-a
            t = max(0, min(1, -a.dot(delta)/delta.length_squared)) if delta.length_squared > 1e-15 else 0
            nearest = min(nearest, (a+delta*t).length)
        return nearest
    for iteration in range(6):
        obj.data.calc_loop_triangles()
        gains = {}
        for triangle in obj.data.loop_triangles:
            radial = [Vector((obj.data.vertices[index].co.z-cy,
                              -obj.data.vertices[index].co.y-cz)) for index in triangle.vertices]
            distance = radial_distance(radial)
            if distance < required:
                if distance < .004:
                    raise ValueError('Power grip topology bridges through the handle cavity')
                gain = required/distance*1.001
                for index in triangle.vertices:
                    gains[index] = max(gains.get(index, 1), gain)
        if not gains:
            break
        for index, gain in gains.items():
            vertex = obj.data.vertices[index]
            if vertex.co.z >= .01499:
                continue  # Keep the authored wrist ring and its flat cap exact.
            vertex.co.z = cy+(vertex.co.z-cy)*gain
            vertex.co.y = -(cz+(-vertex.co.y-cz)*gain)
        obj.data.update()
    else:
        raise ValueError('Power grip could not retain the shared handle clearance')
    obj.data.calc_loop_triangles()
    if len(obj.data.loop_triangles) > 500:
        raise ValueError('Unified power grip exceeds its immutable 500-triangle budget')
    obj.name = 'Unified power grip '+side
    obj['handSide'] = side
    obj['handPose'] = 'power-grip'
    return planar(obj)


def build_grip_hand(parent, side):
    """Create a unified <=500-triangle grip and return its root plus item frame.

    The wrist ring matches the relaxed source palm: local Y=.015, X=side*.001,
    radii .027/.028. Its upper overlap covers the existing forearm seam. The
    replacement is not tagged avatarRegion: the held item's coverage must hide
    the relaxed body hand, never hide its replacement. handSide/handPose remain
    explicit on the root and every mesh after consolidation.
    """
    contract = power_grip_frame(side)
    sign = -1 if side == 'left' else 1
    root = empty('Universal power grip '+side, parent)
    root['handSide'] = side
    root['handPose'] = 'power-grip'
    root['gripRadius'] = contract['radius']
    root['gripCenter'] = contract['center']
    # Rows run from knuckles toward the wrist for outward source normals. Palm
    # widths retain the athletic study's broad knuckles and narrower wrist.
    palm = section('Power grip palm '+side, [
        (-.077, sign*.024, .003, .036, .021),
        (-.042, sign*.016, .000, .043, .027),
        (-.015, sign*.006, .000, .033, .028),
        (.015, sign*.001, .000, .027, .028),
    ], skin, root, n=8)
    palm['handSide'] = side
    palm['handPose'] = 'power-grip'
    planar(palm)

    # All four fingers wrap the same cylinder; only natural finger thickness
    # and knuckle spacing differ. The skin's inner radial face clears .020 m.
    centre_y, centre_z = contract['center'][1:]
    for index, (offset, width, depth) in enumerate([
        (-.027, .0082, .0105),
        (-.009, .0084, .0110),
        (.011, .0083, .0105),
        (.029, .0074, .0092),
    ]):
        x = sign*(.024+offset)
        radius = contract['radius'] + depth + .001
        # Finger roots emerge from the palm behind the handle, then curl
        # underneath and forward through 220 degrees into blunt fingertips.
        points = [(x, centre_y+.004, .003)]
        for angle in [-.50, -.75, -1.00, -1.25, -1.50, -1.72]:
            angle *= math.pi
            points.append((x, centre_y+radius*math.cos(angle),
                           centre_z+radius*math.sin(angle)))
        _grip_sweep('Power grip finger '+str(index+1)+' '+side, points,
                    [width*.95, width, width, width, width, width*.92, width*.55],
                    [depth*.9, depth, depth, depth, depth, depth*.9, depth*.55],
                    skin, root, side)

    # Thumb opposes the first two fingers across their front surfaces. Its
    # broad base is embedded at the inner palm; the tip lies outside the handle.
    thumb_points = [
        (-.025, -.030, .014),
        (-.043, -.040, .030),
        (-.043, -.038, .051),
        (-.025, -.046, .073),
        (-.009, -.049, .077),
        (.004, -.047, .076),
        (.012, -.047, .074),
    ]
    _grip_sweep('Power grip opposed thumb '+side,
                [(sign*x, y, z) for x, y, z in thumb_points],
                [.014, .014, .013, .0125, .012, .010, .006],
                [.014, .014, .013, .0125, .012, .010, .006],
                skin, root, side, n=8)
    _finish_grip_volume(root, side, contract)
    return {'root': root, 'grip': contract}


def build_grip_pair(parent):
    """Optional authoring helper. Runtime mounts only each selected hand."""
    return {side: build_grip_hand(parent, side) for side in ('left', 'right')}
