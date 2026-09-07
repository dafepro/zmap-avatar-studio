"""Nova: copper gathered ponytail and a long, face-framing split fringe.

The source sheet is docs/references/hair-isolated/nova.png. Coordinates are
head-local Y-up/+Z-forward. The existing shared foundation owns scalp coverage;
this module seats its visible fringe and painted gather lines on that surface.
"""

from mathutils.bvhtree import BVHTree


def _nova_pigment(obj, values):
    attr = obj.data.color_attributes.new(
        name='Hair pigment', type='FLOAT_COLOR', domain='CORNER'
    )
    for loop in obj.data.loops:
        shade = values[loop.vertex_index % len(values)]
        attr.data[loop.index].color = (shade, shade, shade, 1)


def _nova_surface(parent):
    foundation = next((obj for obj in parent.children
                       if obj.type == 'MESH' and obj.get('scalpFoundation')), None)
    if foundation is None:
        raise ValueError('Nova requires the common scalp foundation')
    foundation.data.calc_loop_triangles()
    points = [Vector((v.co.x, v.co.z, -v.co.y)) for v in foundation.data.vertices]
    return BVHTree.FromPolygons(
        points, [tuple(triangle.vertices) for triangle in foundation.data.loop_triangles],
        all_triangles=True,
    )


def _nova_front_depth(surface, x, y):
    """Seat locks against the real scalp, continuing over the exposed face."""
    hit, normal, _, _ = surface.ray_cast(Vector((x, y, .8)), Vector((0, 0, -1)))
    rx, front, back = head_section(min(y, .23))
    mid = (front+back)*.5
    envelope_width = rx*HEAD_FAMILY_WIDTH*1.045+.003
    relative_x = min(.985, abs(x)/max(.001, envelope_width))
    shaped_x = math.copysign(rx*relative_x, x)
    depth = mid+(face_depth(shaped_x, y)-mid)*1.055+.015
    depth -= min(.030, max(0, abs(x)-envelope_width)*.45)
    # A continuous cross-section is essential at the open scalp hairline.
    # Switching to arbitrary nearest points beyond the temple caused abrupt
    # depth jumps and torn triangular faces in the first profile render.
    if hit is not None and hit.z > -.04 and normal.z > .04:
        depth = max(depth, hit.z+.004)
    return depth


def _nova_fringe(parent, surface, side):
    # Width and centre describe the concept's parted arch and long cheek tips.
    # Each station is seated separately, so the outer edge turns around the
    # skull while the inner edge follows the forehead and leaves the eyes clear.
    rows = [
        (.224, .039, .015, .006),
        (.210, .047, .031, .015),
        (.192, .066, .046, .022),
        (.167, .086, .052, .024),
        (.142, .106, .054, .023),
        (.111, .129, .055, .023),
        (.081, .148, .052, .022),
        (.047, .165, .047, .021),
        (.016, .171, .036, .020),
        (-.021, .169, .030, .017),
        (-.055, .158, .023, .012),
        (-.088, .144, .011, .007),
        (-.112, .132, .001, .001),
    ]
    section = [(-1, 0), (-.56, .74), (0, 1), (.62, .62), (1, 0), (0, -.40)]
    vertices = []
    for y, centre, width, thickness in rows:
        for across, depth in section:
            x = side * (centre + across * width)
            z = _nova_front_depth(surface, x, y)
            vertices.append((x, y, z + depth * thickness))
    faces = []
    count = len(section)
    for row in range(len(rows) - 1):
        for j in range(count):
            a = row * count + j
            b = row * count + (j + 1) % count
            faces.append((a, b, b + count, a + count))
    faces += [tuple(reversed(range(count))),
              tuple(range((len(rows) - 1) * count, len(rows) * count))]
    obj = smooth(mesh('Nova seated ' + ('left' if side < 0 else 'right') + ' curtain fringe',
                      vertices, faces, hair, parent))
    _nova_pigment(obj, [.65, .94, 1, .90, .70, .60])

def _nova_centre_fringe(parent, surface):
    # The central point is part of the gathered fringe. It forms the reference
    # sheet's shallow V without lowering a horizontal cap over the eyebrows.
    outline = [(-.044, .200), (-.037, .157), (0, .083), (.041, .158), (.044, .200)]
    vertices = [(x, y, _nova_front_depth(surface, x, y) + .002) for x, y in outline]
    vertices.append((0, .164, _nova_front_depth(surface, 0, .164) + .025))
    shades = [.79, .74, .68, .85, .91, .99]
    faces = []
    seam_faces = []
    ridge = len(outline)
    # Two narrow ink bands are tessellated into the actual V surface. They do
    # not sit above it, so neither a side view nor a hat can reveal a floater.
    for i in range(len(outline)):
        j = (i+1) % len(outline)
        if i in (1, 2):
            a, b, peak = Vector(vertices[i]), Vector(vertices[j]), Vector(vertices[ridge])
            inner_a, inner_b = len(vertices), len(vertices)+1
            vertices += [tuple(a.lerp(peak, .026)), tuple(b.lerp(peak, .026))]
            shades += [shades[i]*.974+shades[ridge]*.026,
                       shades[j]*.974+shades[ridge]*.026]
            seam_faces.append(len(faces))
            faces.append((i, j, inner_b, inner_a))
            faces.append((inner_a, inner_b, ridge))
        else:
            faces.append((i, j, ridge))
    obj = smooth(mesh('Nova central gathered V', vertices, faces, hair, parent))
    _nova_pigment(obj, shades)
    pigment = obj.data.color_attributes['Hair pigment']
    for face_index in seam_faces:
        for loop in obj.data.polygons[face_index].loop_indices:
            pigment.data[loop].color = (.28, .28, .28, 1)


def _nova_loft(parent, name, rows, count=10, ink_panels=False):
    """Closed sculpted tail with transported cross-sections and a painted ridge."""
    points = [Vector(row[:3]) for row in rows]
    angles = [j*math.tau/count for j in range(count)]
    if ink_panels:
        # Four slim strips delimit two broad flowing panels on each side of
        # the solid tail. They are part of its existing surface, with a subtle
        # crease and per-corner pigment; no duplicated lock shells or decals.
        for centre in [math.pi/6, math.pi*5/6, math.pi*7/6, math.pi*11/6]:
            angles += [centre-.012, centre+.012]
        angles.sort()
    count = len(angles)
    vertices = []
    shades = []
    for index, (point, row) in enumerate(zip(points, rows)):
        tangent = (points[min(index+1, len(points)-1)] - points[max(0, index-1)]).normalized()
        across = (Vector((1, 0, 0)) - tangent * tangent.x).normalized()
        normal = across.cross(tangent).normalized()
        for j, authored_angle in enumerate(angles):
            t = index/(len(points)-1)
            a = authored_angle + (.16*math.sin(math.pi*t)+.07*t if ink_panels else 0)
            lateral = math.sin(a)
            depth = math.cos(a)
            vertices.append(tuple(point + across * (lateral * row[3]) + normal * (depth * row[4])))
            # Values form long broad washes along the tail's flow. Geometry
            # provides the cel shadows; no polygon gets an arbitrary dark patch.
            wash = .76 + .19*max(0, depth) + .05*max(0, -lateral)
            if ink_panels:
                wash *= .94+.06*math.cos(authored_angle*3+.20)
            shades.append(wash)
    faces = []
    for row in range(len(rows)-1):
        for j in range(count):
            a = row*count+j
            b = row*count+(j+1) % count
            faces.append((a, b, b+count, a+count))
    faces += [tuple(reversed(range(count))), tuple(range((len(rows)-1)*count, len(rows)*count))]
    obj = smooth(mesh(name, vertices, faces, hair, parent))
    _nova_pigment(obj, shades)
    if ink_panels:
        pigment = obj.data.color_attributes['Hair pigment']
        for row in range(len(rows)-1):
            # Ends dissolve into the tie and the terminal curl rather than
            # turning the mesh caps into inked radial spokes.
            t = (row+.5)/(len(rows)-1)
            shade = .31+.29*abs(2*t-1)**4
            for column in range(count-1):
                if angles[column+1]-angles[column] < .03:
                    poly = obj.data.polygons[row*count+column]
                    for loop in poly.loop_indices:
                        pigment.data[loop].color = (shade, shade, shade, 1)
    return obj


def _nova_fringe_root_shadow(parent):
    """Paint a restrained root shadow beneath the parted fringe, on the scalp."""
    foundation = next(obj for obj in parent.children
                      if obj.type == 'MESH' and obj.get('scalpFoundation'))
    pigment = foundation.data.color_attributes.get('Hair pigment')
    if pigment is None:
        pigment = foundation.data.color_attributes.new(
            name='Hair pigment', type='FLOAT_COLOR', domain='CORNER'
        )
    for loop in foundation.data.loops:
        point = foundation.data.vertices[loop.vertex_index].co
        x, y, z = point.x, point.z, -point.y
        front = min(1, max(0, (z-.04)/.10))
        low = min(1, max(0, (.188-y)/.106))
        centre = max(0, 1-(abs(x)/.155)**2)
        shade = 1-.35*front*low*centre
        pigment.data[loop.index].color = (shade, shade, shade, 1)


def _nova_tie(parent):
    centre = Vector((0, .235, -.213))
    tangent = Vector((.02, .336, -.254)) - Vector((0, .174, -.171))
    tangent.normalize()
    across = (Vector((1, 0, 0)) - tangent * tangent.x).normalized()
    normal = across.cross(tangent).normalized()
    count = 12
    vertices = []
    for sign in (-1, 1):
        for j in range(count):
            a = j * math.tau / count
            vertices.append(tuple(centre + tangent*(sign*.013)
                                  + across*(math.sin(a)*.046)
                                  + normal*(math.cos(a)*.038)))
    faces = [(j, (j+1) % count, (j+1) % count+count, j+count) for j in range(count)]
    faces += [tuple(reversed(range(count))), tuple(range(count, count*2))]
    smooth(mesh('Nova snug dark ponytail tie', vertices, faces, ink, parent))


def _nova_gather_lines(parent, surface):
    # Every small ink ribbon is projected onto the actual shared foundation.
    # Front and side roots arc towards the high rear gather, showing the crown's
    # coherent flow without floating decorative strips or another scalp shell.
    centre = Vector((0, .050, -.015))
    starts = [(-.137, .071, .126), (-.193, -.004, .034), (-.142, -.081, -.098),
              (.137, .071, .126), (.193, -.004, .034), (.142, -.081, -.098),
              (0, -.104, -.133)]
    for index, start in enumerate(starts):
        p0 = Vector(start)
        p1 = Vector((p0.x*.88, .263, -.091))
        p2 = Vector((0, .192, -.179))
        samples = []
        for step in range(18):
            t = step / 17
            p = p0*(1-t)**2 + p1*(2*t*(1-t)) + p2*t*t
            direction = (p-centre).normalized()
            hit, normal, _, _ = surface.ray_cast(centre + direction*.7, -direction)
            if hit is None:
                continue
            samples.append((hit, normal))
        vertices = []
        for step, (point, normal) in enumerate(samples):
            tangent = (samples[min(step+1, len(samples)-1)][0] - samples[max(0, step-1)][0]).normalized()
            across = normal.cross(tangent).normalized()
            width = .00045 if step in (0, len(samples)-1) else .00085
            for side in (-1, 1):
                vertices.append(tuple(point + normal*.0015 + across*(side*width)))
        faces = [(i*2, i*2+1, i*2+3, i*2+2) for i in range(len(samples)-1)]
        seam = mesh('Nova scalp-seated gather seam ' + str(index+1), vertices, faces, hair, parent)
        _nova_pigment(seam, [.33, .33])


def build_nova_hair(parent):
    surface = _nova_surface(parent)
    for side in (-1, 1):
        _nova_fringe(parent, surface, side)
    _nova_centre_fringe(parent, surface)
    _nova_fringe_root_shadow(parent)
    _nova_gather_lines(parent, surface)

    # The first two stations intersect the upper rear scalp before the tail
    # exits through its tie. The root is a real filled connection, not a joint
    # hovering behind the head. The arch continues into a hanging solid mass.
    _nova_loft(parent, 'Nova high arched ponytail', [
        (0, .174, -.171, .047, .034),
        (0, .235, -.213, .041, .033),
        (.060, .334, -.253, .071, .051),
        (.085, .372, -.283, .088, .056),
        (.102, .391, -.321, .105, .060),
        (.115, .385, -.360, .118, .065),
        (.124, .358, -.393, .124, .069),
        (.129, .308, -.414, .121, .073),
        (.130, .218, -.426, .115, .066),
        (.139, .113, -.421, .103, .058),
        (.145, .011, -.397, .091, .049),
        (.150, -.079, -.378, .075, .041),
        (.144, -.149, -.400, .040, .030),
        (.130, -.223, -.454, .0008, .001),
    ], ink_panels=True)
    _nova_loft(parent, 'Nova right hooked tail end', [
        (.134, -.028, -.412, .045, .031),
        (.158, -.091, -.401, .046, .037),
        (.199, -.137, -.415, .038, .032),
        (.241, -.138, -.450, .023, .022),
        (.273, -.077, -.472, .0008, .001),
    ], count=8)
    _nova_loft(parent, 'Nova left hooked tail end', [
        (.109, -.020, -.412, .046, .029),
        (.053, -.081, -.409, .047, .032),
        (.006, -.119, -.423, .035, .029),
        (-.043, -.113, -.455, .019, .017),
        (-.072, -.072, -.466, .0008, .001),
    ], count=8)
    _nova_tie(parent)
