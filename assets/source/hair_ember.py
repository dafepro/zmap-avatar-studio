"""Compact interlocked coils for Ember's isolated front/side/back/top sheet.

Executed in reference_kit.py's globals. The shared scalp remains untouched.
Every coil has an elongated bent axis and broad bevelled ends; there are no
spheres, per-hat variants, or pigments coupled to a clothing channel.
"""


def _ember_height(triangles, x, z):
    """Highest point of a real triangulated foundation at this footprint."""
    result = None
    for a, b, c in triangles:
        det = (b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z)
        if abs(det) < 1e-12:
            continue
        u = ((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/det
        v = ((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/det
        if u >= -1e-6 and v >= -1e-6 and u+v <= 1.000001:
            y = u*a.y+v*b.y+(1-u-v)*c.y
            result = y if result is None else max(result, y)
    return result


def _ember_pigment(obj, shades):
    pigment = obj.data.color_attributes.new(name='Hair pigment', type='FLOAT_COLOR', domain='CORNER')
    for poly in obj.data.polygons:
        shade = shades[poly.index % len(shades)]
        for loop in poly.loop_indices:
            pigment.data[loop].color = (shade, shade, shade, 1)


def _ember_fold(parent, name, triangles, center, tangent, across, normal):
    """A small painted C crease sits on actual coil faces, not in mid-air."""
    projected = [[Vector(((v-center).dot(tangent), (v-center).dot(normal), (v-center).dot(across))) for v in tri] for tri in triangles]
    path = [(-.022, .001), (-.010, .014), (.005, .015), (.018, .004), (.015, -.010), (.003, -.015)]
    vertices = []
    for i, (u, v) in enumerate(path):
        previous = Vector(path[max(0, i-1)])
        following = Vector(path[min(len(path)-1, i+1)])
        direction = (following-previous).normalized()
        side = Vector((-direction.y, direction.x))
        width = .00065 if i in (0, len(path)-1) else .00125
        for sign in (-1, 1):
            x, z = u+side.x*width*sign, v+side.y*width*sign
            y = _ember_height(projected, x, z)
            if y is None:
                return
            vertices.append(tuple(center+tangent*x+across*z+normal*(y+.0006)))
    crease = mesh(name, vertices, [(i*2, i*2+1, i*2+3, i*2+2) for i in range(len(path)-1)], hair, parent)
    _ember_pigment(crease, [.13, .17, .15, .12, .19])


def _ember_coil(parent, index, x, z, surface, angle, length, width, height, folded, normal=None):
    normal = normal.normalized() if normal is not None else Vector((x/.21, .90, (z+.019)/.23)).normalized()
    direction = Vector((math.sin(angle), 0, -math.cos(angle)))
    tangent = (direction-normal*direction.dot(normal)).normalized()
    across = normal.cross(tangent).normalized()
    # Roots are buried a little in the foundation; neighbouring broad coils
    # overlap each other instead of balancing on separate bead-like bases.
    center = Vector((x, surface, z))+normal*.015
    vertices = []
    section = [(-.95, -.12), (-.61, .87), (.38, 1), (1, .12), (.30, -.68)]
    if index < 5:
        # The exposed frontal curl silhouettes get an extra bevel around
        # their section; dense posterior overlaps need less geometry.
        section = [(-.90, -.42), (-1, .30), (-.58, .91), (.53, 1), (1, .27), (.66, -.63)]
    count = len(section)
    stations = [(-1, .54, -.003), (-.42, .95, .012), (.42, .98, .008), (1, .56, -.006)]
    for station, (t, fullness, curl) in enumerate(stations):
        point = center+tangent*(t*length*.5)+across*curl
        twist = (station-1.5)*(.055 if index%2 else -.045)
        for lateral, depth in section:
            a = lateral*math.cos(twist)-depth*math.sin(twist)
            b = lateral*math.sin(twist)+depth*math.cos(twist)
            vertices.append(tuple(point+across*(a*width*fullness)+normal*(b*height*fullness)))
    faces = []
    for row in range(3):
        for j in range(count):
            a = row*count+j
            b = row*count+(j+1)%count
            faces.append((a, b, b+count, a+count))
    faces += [tuple(reversed(range(count))), tuple(range(3*count, 4*count))]
    coil = smooth(mesh('Ember interlocked coil %02d'%index, vertices, faces, hair, parent))
    # Soft transitions along the bent axis, with defined broad terminal folds.
    for poly in coil.data.polygons[-2:]:
        poly.use_smooth = False
    variance = .975+.025*math.sin(index*2.1)
    _ember_pigment(coil, [v*variance for v in [.92, 1, .98, .94, .78, .95, 1, .98, .90, .82, .92, 1, .98, .92, .80, .94, .96]])
    if folded:
        points = [Vector(v) for v in vertices]
        triangles = [[points[face[0]], points[face[i]], points[face[i+1]]] for face in faces for i in range(1, len(face)-1)]
        _ember_fold(parent, 'Ember C fold %02d'%index, triangles, center, tangent, across, normal)


def build_ember_hair(parent):
    foundation = next((obj for obj in parent.children if obj.type == 'MESH' and obj.get('scalpFoundation')), None)
    if foundation is None:
        raise ValueError('Ember coils require the shared scalp foundation')
    foundation.data.calc_loop_triangles()
    points = [Vector((v.co.x, v.co.z, -v.co.y)) for v in foundation.data.vertices]
    triangles = [[points[i] for i in tri.vertices] for tri in foundation.data.loop_triangles]
    # The first row follows the actual frontal hairline. Overhead-only
    # placement leaves a smooth forehead band beneath a crown of curls.
    index = 0
    for x in [-.143, -.070, .007, .080, .145]:
        y = .115+.003*math.sin(index*1.4)
        rx, front, back = head_section(y)
        mid = (front+back)*.5
        z = mid+(face_depth(x/(HEAD_FAMILY_WIDTH*1.045), y)-mid)*1.055+.005
        normal = Vector((x/.34, .33, 1))
        angle = -.31 if index%2 else .24
        _ember_coil(parent, index, x, z, y, angle, .098, .036, .028, index == 2, normal)
        index += 1
    # Three staggered crown rows remain scalp sampled. The last five coils
    # turn onto the occipital surface, eliminating the tall bare rear band.
    rows = [
        (.075, [-.149, -.074, .001, .080, .155]),
        (-.020, [-.166, -.084, .002, .087, .168]),
        (-.110, [-.138, -.066, .011, .087, .150]),
    ]
    for row, (z, xs) in enumerate(rows):
        for column, x in enumerate(xs):
            x += .0035*math.sin(index*2.3)
            depth = z+.004*math.cos(index*1.7)
            surface = _ember_height(triangles, x, depth)
            if surface is None:
                raise ValueError('Ember coil %d falls outside its shared scalp'%index)
            angle = (-.53 if (column+row)%2 else .62)+.23*math.sin(index*1.35)
            length = .108+.011*math.sin(index*1.7)
            width = .042+.0025*math.cos(index*1.4)
            height = .029+.002*math.sin(index*.95)
            _ember_coil(parent, index, x, depth, surface, angle, length, width, height, index == 12)
            index += 1
    for a, y in [(2.25, .113), (2.70, .082), (3.14, .093), (3.61, .080), (4.06, .111)]:
        rx, front, back = head_section(y)
        mid = (front+back)*.5
        x = math.sin(a)*(rx*HEAD_FAMILY_WIDTH*1.045+.003)
        z = mid+math.cos(a)*((front-back)*.5*1.055+.005)
        normal = Vector((math.sin(a), .30, math.cos(a)))
        angle = .30 if index%2 else -.38
        _ember_coil(parent, index, x, z, y, angle, .099, .037, .027, index == 22, normal)
        index += 1
    # These transition rows are essential in orthographic front/back views:
    # an overhead packing can look full while leaving smooth bald bands on
    # the steep forehead and occipital slopes between crown and hairline.
    for x in [-.113, -.037, .048, .128]:
        y = .164+.005*math.sin(index)
        rx, front, back = head_section(y)
        mid = (front+back)*.5
        z = mid+(face_depth(x/(HEAD_FAMILY_WIDTH*1.045), y)-mid)*1.055+.005
        normal = Vector((x/.30, .65, .85))
        angle = .32 if index%2 else -.39
        _ember_coil(parent, index, x, z, y, angle, .103, .041, .030, False, normal)
        index += 1
    for a in [2.35, 2.90, 3.44, 3.94]:
        y = .153+.006*math.sin(index*1.3)
        rx, front, back = head_section(y)
        mid = (front+back)*.5
        x = math.sin(a)*(rx*HEAD_FAMILY_WIDTH*1.045+.003)
        z = mid+math.cos(a)*((front-back)*.5*1.055+.005)
        normal = Vector((math.sin(a), .62, math.cos(a)))
        angle = -.34 if index%2 else .36
        _ember_coil(parent, index, x, z, y, angle, .103, .040, .030, False, normal)
        index += 1
