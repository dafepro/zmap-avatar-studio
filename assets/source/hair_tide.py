"""Tide's asymmetrical bob, traced from the isolated four-view hair study.

Executed in reference_kit.py's authoring globals. This module adds the visible
style only; scalp_foundation owns coverage and compatibility. The closed mantle
provides one crown/back silhouette. Two broad front sweeps provide the part and
the deliberately unequal fringe, rather than disconnected flat side panels.
Coordinates are head-local, Y up, +Z forward. Added geometry: at most 862 triangles.
"""

from mathutils.bvhtree import BVHTree


def tide_section(y):
    """Rounded crown into a close, inward-turning chin-length bob."""
    rows = [
        (-.19, .172, .172),
        (-.17, .178, .183),
        (-.07, .205, .210),
        (.04, .213, .224),
        (.13, .207, .225),
        (.205, .178, .200),
        (.250, .120, .150),
        (.279, .022, .035),
    ]
    for lower, upper in zip(rows, rows[1:]):
        if y <= upper[0]:
            f = max(0, min(1, (y - lower[0]) / (upper[0] - lower[0])))
            return tuple(lower[j] * (1 - f) + upper[j] * f for j in (1, 2))
    return rows[-1][1:]


def tide_pigment(obj, values, vertex_values=None):
    """A restrained painted value pattern that still accepts any hair colour."""
    attr = obj.data.color_attributes.new(
        name='Hair pigment', type='FLOAT_COLOR', domain='CORNER'
    )
    for poly, value in zip(obj.data.polygons, values):
        for index in poly.loop_indices:
            shade = vertex_values.get(obj.data.loops[index].vertex_index, value) if vertex_values is not None else value
            attr.data[index].color = (shade, shade, shade, 1)


def tide_mantle(parent):
    count = 28
    stations = [0, .07, .17, .30, .45, .62, .81, 1]
    vertices = []
    faces = []
    pigment = []

    for t in stations:
        for j in range(count):
            a = j * math.tau / count
            front = max(0, math.cos(a))
            # Seven broad points at the lower back and sides; no saw-toothed
            # fringe across the forehead. The two authored sweeps supply that.
            hem = -.165 + .267 * front**2
            hem += (.017 * math.cos(7 * a) + .011 * math.sin(3 * a)) * (1 - front**3)
            y = .279 * (1 - t) + hem * t
            rx, rz = tide_section(y)
            flow = a + .12 * math.sin(math.pi * t) + .05 * t
            x = -.012 * (1 - t) + math.sin(flow) * rx
            z = -.015 + math.cos(flow) * rz
            # The bob turns behind the ear instead of covering it until only
            # the tip of its skin geometry pokes through the hair curtain.
            ear = math.exp(-((y + .066) / .048)**4) * math.exp(-(math.cos(flow) / .18)**4)
            x -= math.copysign(.038 * ear, x)
            # A slight crown asymmetry supports the heavy sweep on the left.
            y += .008 * max(0, -math.sin(a)) * math.sin(math.pi * t)
            vertices.append((x, y, z))

    outer_count = len(vertices)
    # An inset inner wall and closed hem give the bob actual mass around the
    # jaw, including when viewed from below. The foundation remains untouched.
    inner_stations = [0, 5, 7]
    for row in inner_stations:
        for x, y, z in vertices[row * count:(row + 1) * count]:
            outward = Vector((x, 0, z + .015))
            if outward.length:
                outward.normalize()
            vertices.append((x - outward.x * .014, y - .002, z - outward.z * .014))

    for inner in (False, True):
        base = outer_count if inner else 0
        for row in range((len(inner_stations) if inner else len(stations)) - 1):
            for j in range(count):
                a = base + row * count + j
                b = base + row * count + (j + 1) % count
                face = (a, b, b + count, a + count)
                faces.append(face if inner else tuple(reversed(face)))
                pigment.append(.61 if inner else .92)

    for j in range(count):
        a = (len(stations) - 1) * count + j
        b = (len(stations) - 1) * count + (j + 1) % count
        inner_a = outer_count + (len(inner_stations) - 1) * count + j
        inner_b = outer_count + (len(inner_stations) - 1) * count + (j + 1) % count
        faces.append((a, inner_a, inner_b, b))
        pigment.append(.65)
    faces += [tuple(range(count)), tuple(reversed(range(outer_count, outer_count + count)))]
    pigment += [.91, .61]

    # The mantle itself supplies the support surface for the fringe.
    outside_faces = faces[:(len(stations) - 1) * count]
    bvh = BVHTree.FromPolygons([Vector(v) for v in vertices[:outer_count]], outside_faces)
    # Long, restrained grooves follow the actual flowing mesh columns on the
    # sides and back. They lie on the mantle, not on separate floating panels.
    for column in (7, 11, 15, 19, 23):
        base = len(vertices)
        for row in range(4, len(stations)):
            centre = Vector(vertices[row * count + column])
            left = Vector(vertices[row * count + (column - 1) % count])
            right = Vector(vertices[row * count + (column + 1) % count])
            across = (right - left).normalized()
            normal = (centre - Vector((0, .055, -.015))).normalized()
            for side in (-1, 1):
                vertices.append(tuple(centre + across * (.0009 * side) + normal * .0008))
        for row in range(len(stations) - 5):
            a = base + row * 2
            faces.append((a, a + 1, a + 3, a + 2))
            pigment.append(.40)
    obj = smooth(mesh('Tide continuous rounded bob', vertices, faces, hair, parent))
    # Values are continuous at shared vertices: the top has two longitudinal
    # flowing masses rather than a radial pie-chart pattern of flat polygons.
    wash = {}
    for index, (x, y, z) in enumerate(vertices[:outer_count]):
        distance = x - (.052 + .025*z)
        stream = z + math.copysign(.24 * abs(distance)**.75, distance)
        wash[index] = .925 + .035 * math.cos(stream * 22) - .04 * abs(distance) / .26
    tide_pigment(obj, pigment, wash)
    return obj, bvh


def tide_fringe(parent, name, control, width, thickness, mantle):
    """A solid sweep seated on the mantle, with a short hem continuation."""
    control = [Vector(v) for v in control]
    stations = [0, .19, .39, .61, .82, 1]
    vertices = []
    faces = []
    pigment = []
    count = 6
    for t in stations:
        u = 1 - t
        centre = control[0] * u**3 + control[1] * (3*u*u*t) + control[2] * (3*u*t*t) + control[3] * t**3
        tangent = ((control[1] - control[0]) * (3*u*u) + (control[2] - control[1]) * (6*u*t) + (control[3] - control[2]) * (3*t*t)).normalized()
        across = Vector((-tangent.y, tangent.x, 0)).normalized()
        fullness = math.sin(math.pi * t)**.66
        w = width * fullness + .010 * u + .0007 * t
        h = thickness * fullness + .004 * u + .0008 * t
        for x, z in [(-1, 0), (-.55, .72), (.06, 1), (.63, .61), (1, 0), (0, -.68)]:
            point = centre + across * (x*w)
            hit, normal, _, _ = mantle.ray_cast(Vector((point.x, point.y, .8)), Vector((0, 0, -1)))
            if hit is not None and hit.z > -.01 and normal.z > .05:
                depth = hit.z
            else:
                rx, _, _ = head_section(min(point.y, .23))
                if abs(point.x) < rx * HEAD_FAMILY_WIDTH and point.y < .23:
                    # Beyond the mantle's open face boundary, the fringe stays
                    # close to the actual forehead, independent of head width.
                    depth = face_depth(point.x / HEAD_FAMILY_WIDTH, point.y) + .010
                else:
                    nearest, _, _, _ = mantle.find_nearest(Vector((point.x, point.y, .035)))
                    depth = nearest.z if nearest is not None else .035
            vertices.append((point.x, point.y, depth + .001 + z*h))
    for row in range(len(stations) - 1):
        for j in range(count):
            a = row * count + j
            b = row * count + (j + 1) % count
            faces.append((a, b, b + count, a + count))
            pigment.append([.83, .97, .91, .78, .62, .69][j])
    faces += [tuple(reversed(range(count))), tuple(range((len(stations) - 1) * count, len(stations) * count))]
    pigment += [.86, .75]
    obj = smooth(mesh(name, vertices, faces, hair, parent))
    # A continuous value wash follows the sweep and its smooth normals. Hard
    # colour seams on individual triangles made the earlier fringe look torn.
    shades = [.81, .94, .99, .92, .79, .70]
    wash = {index: shades[index % count] for index in range(len(vertices))}
    tide_pigment(obj, pigment, wash)
    return obj


def tide_part(parent, objects):
    """A narrow continuous part on the assembled surface, from front to nape."""
    vertices = []
    faces = []
    for obj in objects:
        base = len(vertices)
        vertices.extend(Vector((v.co.x, v.co.z, -v.co.y)) for v in obj.data.vertices)
        faces.extend(tuple(base + index for index in poly.vertices) for poly in obj.data.polygons)
    surface = BVHTree.FromPolygons(vertices, faces)
    line = []

    def sample(x, y, z, direction):
        pair = []
        direction = Vector(direction)
        for side in (-1, 1):
            hit, _, _, _ = surface.ray_cast(Vector((x + side*.00075, y, z)), direction)
            if hit is not None:
                pair.append(tuple(hit - direction*.0012))
        if len(pair) == 2:
            line.append(pair)

    for index in range(33):
        t = index/32
        sample(.058 + .005*math.sin(math.pi*t) - .024*t, .8, .215 - .435*t, (0, -1, 0))
    if line:
        back_y = sum(p[1] for p in line[-1])*.5
        for index in range(1, 11):
            t = index/10
            sample(.034*(1-t)+.011*t, back_y*(1-t)-.142*t, -.8, (0, 0, 1))
    vertices = [p for pair in line for p in pair]
    faces = [(2*i, 2*i+1, 2*i+3, 2*i+2) for i in range(len(line)-1)]
    seam = mesh('Tide continuous off-centre part', vertices, faces, hair, parent)
    tide_pigment(seam, [.24]*len(faces))


def build_tide_hair(parent):
    mantle_obj, mantle = tide_mantle(parent)
    long_fringe = tide_fringe(
        parent, 'Tide long side-swept fringe',
        [(.058, .242, .151), (-.072, .223, .236), (-.212, .066, .222), (-.229, -.071, .129)],
        .076, .019, mantle,
    )
    inner_fringe = tide_fringe(
        parent, 'Tide pointed inner fringe',
        [(.064, .220, .183), (.017, .161, .238), (-.020, .091, .235), (-.076, .030, .198)],
        .031, .015, mantle,
    )
    tide_part(parent, [mantle_obj, long_fringe, inner_fringe])
