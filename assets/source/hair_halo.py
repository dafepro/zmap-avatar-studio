"""Halo's closed, scalloped afro mantle from its four-view isolated study.

Executed in reference_kit.py globals. Overlapping radial fields produce one
continuous curl mass; the shared scalp owns the underlying coverage contract.
No separate bead meshes, scalp edits, or accessory-specific variants are used.
"""


def _halo_lobes():
    lobes = []
    rows = [(.075, 1), (.45, 6), (.91, 11), (1.38, 13), (1.85, 12), (2.30, 9), (2.69, 5)]
    for row, (theta, count) in enumerate(rows):
        for column in range(count):
            a = column*math.tau/count + [.5, .3, .65, .16, .57, .29, .87][row]
            a += .035*math.sin(column*2.1+row)
            t = theta+.037*math.sin(column*1.9-row*.8)
            axis = Vector((math.sin(t)*math.sin(a), math.cos(t), math.sin(t)*math.cos(a)))
            # These are radial support volumes, never separate sphere meshes.
            # Their max envelope retains each rounded peak and its surrounding
            # valley instead of averaging everything into one smooth sphere.
            center = .903+.009*math.sin(column*2.3+row*.9)
            radius = .245+.013*math.cos(column*1.7+row)
            lobes.append((axis, center, radius, .07*math.sin(len(lobes)*2.41)))
    return lobes


def _halo_boundary(a):
    signed = (a+math.pi) % math.tau-math.pi
    angle = abs((a+math.pi) % math.tau-math.pi)
    if angle <= .98:
        # Three rounded curl lips cover the structural scalp's front edge.
        # Leaving this mantle above that edge exposes a straight cap band.
        arc = .112-.014*(signed/.98)**2
        dip = max(.022*math.exp(-((signed-center)/.19)**2) for center in [-.61, 0, .61])
        return arc-dip
    profile = [(.98, .0975), (1.2, .020), (1.48, -.015), (1.72, -.065), (2.05, -.120), (math.pi, -.150)]
    for (a0, y0), (a1, y1) in zip(profile, profile[1:]):
        if angle <= a1:
            t = (angle-a0)/(a1-a0)
            # A rounded lip follows the open forehead and the fronts of the
            # ears. Its irregular scallops belong to the continuous mantle.
            fade = max(0, min(1, (angle-.98)/.30))
            return y0+(y1-y0)*t+fade*(.013*math.cos(9*a+.35)+.004*math.cos(17*a))
    return profile[-1][1]


def _halo_point(direction, lobes):
    scale = 1.0
    candidates = []
    for axis, distance, radius, pigment in lobes:
        cosine = direction.dot(axis)
        discriminant = radius*radius-distance*distance*(1-cosine*cosine)
        if cosine <= 0 or discriminant <= 0:
            continue
        candidate = distance*cosine+math.sqrt(discriminant)
        if candidate <= 1:
            continue
        candidates.append((candidate, pigment))
        # Only a 3 mm blend at the join; the rounded lobe is otherwise exact.
        blend = max(.013-abs(scale-candidate), 0)/.013
        scale = max(scale, candidate)+blend*blend*.013*.25
    # The sheet's afro is substantially wider than the skull and returns
    # around the jaw. The closed support geometry is enlarged as one mass.
    point = Vector((.2714*direction.x*scale, .066+.2708*direction.y*scale, -.028+.252*direction.z*scale))
    weight = sum(math.exp((candidate-scale)/.023) for candidate, _ in candidates)
    pigment = sum(value*math.exp((candidate-scale)/.023) for candidate, value in candidates)/max(weight, .000001)
    shade = .66+.27*max(0, min(1, (scale-1)/.15))+pigment
    shade *= .95+.05*max(0, min(1, (point.y+.12)/.31))
    return point, min(.99, shade)


def _halo_surface(a, theta, lobes):
    direction = Vector((math.sin(theta)*math.sin(a), math.cos(theta), math.sin(theta)*math.cos(a)))
    return _halo_point(direction, lobes)


def _halo_directions():
    """Uniform geodesic samples spend polygons on curls, not a crowded pole."""
    phi = (1+math.sqrt(5))/2
    points = [Vector(p).normalized() for p in [(-1,phi,0),(1,phi,0),(-1,-phi,0),(1,-phi,0),(0,-1,phi),(0,1,phi),(0,-1,-phi),(0,1,-phi),(phi,0,-1),(phi,0,1),(-phi,0,-1),(-phi,0,1)]]
    faces = [(0,11,5),(0,5,1),(0,1,7),(0,7,10),(0,10,11),(1,5,9),(5,11,4),(11,10,2),(10,7,6),(7,1,8),(3,9,4),(3,4,2),(3,2,6),(3,6,8),(3,8,9),(4,9,5),(2,4,11),(6,2,10),(8,6,7),(9,8,1)]
    for _ in range(3):
        cache = {}
        refined = []
        def midpoint(a, b):
            key = tuple(sorted((a, b)))
            if key not in cache:
                cache[key] = len(points)
                points.append((points[a]+points[b]).normalized())
            return cache[key]
        for a,b,c in faces:
            ab,bc,ca = midpoint(a,b),midpoint(b,c),midpoint(c,a)
            refined += [(a,ab,ca),(b,bc,ab),(c,ca,bc),(ab,bc,ca)]
        faces = refined
    return points, faces


def _halo_mantle(lobes):
    """Clip one manifold directional mesh at the open forehead/ear/nape lip."""
    directions, faces = _halo_directions()
    def inside(direction):
        a = math.atan2(direction.x, direction.z)
        return direction.y >= (_halo_boundary(a)-.066)/.236
    keep = [inside(point) for point in directions]
    intersections = {}
    def crossing(a, b):
        key = tuple(sorted((a, b)))
        if key not in intersections:
            start, end = directions[a], directions[b]
            start_inside = keep[a]
            low, high = 0.0, 1.0
            for _ in range(20):
                t = (low+high)*.5
                direction = (start*(1-t)+end*t).normalized()
                if inside(direction) == start_inside:
                    low = t
                else:
                    high = t
            t = (low+high)*.5
            intersections[key] = len(directions)
            directions.append((start*(1-t)+end*t).normalized())
        return intersections[key]
    clipped = []
    for face in faces:
        polygon = []
        for index, a in enumerate(face):
            b = face[(index+1)%3]
            if keep[a]:
                polygon.append(a)
            if keep[a] != keep[b]:
                polygon.append(crossing(a, b))
        for index in range(1, len(polygon)-1):
            clipped.append((polygon[0], polygon[index], polygon[index+1]))
    used = sorted(set(index for face in clipped for index in face))
    mapping = {old: new for new, old in enumerate(used)}
    directions = [directions[index] for index in used]
    faces = [tuple(mapping[index] for index in face) for face in clipped]
    edge_uses = {}
    for face in faces:
        for index, a in enumerate(face):
            b = face[(index+1)%3]
            edge_uses.setdefault(tuple(sorted((a,b))), []).append((a,b))
    boundary = [uses[0] for uses in edge_uses.values() if len(uses) == 1]
    vertices, shades = [], []
    for direction in directions:
        point, shade = _halo_point(direction, lobes)
        vertices.append(tuple(point))
        shades.append(shade)
    return vertices, shades, faces, boundary


def _halo_pigment(obj, shades):
    pigment = obj.data.color_attributes.new(name='Hair pigment', type='FLOAT_COLOR', domain='CORNER')
    for poly in obj.data.polygons:
        for loop in poly.loop_indices:
            shade = shades[obj.data.loops[loop].vertex_index]
            pigment.data[loop].color = (shade, shade, shade, 1)


def _halo_project(triangles, u, v):
    depth = None
    for a, b, c in triangles:
        denominator = (b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z)
        if abs(denominator) < 1e-12:
            continue
        s = ((b.z-c.z)*(u-c.x)+(c.x-b.x)*(v-c.z))/denominator
        t = ((c.z-a.z)*(u-c.x)+(a.x-c.x)*(v-c.z))/denominator
        if s >= -1e-6 and t >= -1e-6 and s+t <= 1.000001:
            candidate = s*a.y+t*b.y+(1-s-t)*c.y
            depth = candidate if depth is None else max(depth, candidate)
    return depth


def _halo_curl(parent, index, triangles, a, theta, lobes):
    center, _ = _halo_surface(a, theta, lobes)
    u = (_halo_surface(a+.002, theta, lobes)[0]-_halo_surface(a-.002, theta, lobes)[0]).normalized()
    down = (_halo_surface(a, theta+.002, lobes)[0]-_halo_surface(a, theta-.002, lobes)[0]).normalized()
    normal = u.cross(down).normalized()
    outward = center-Vector((0, .066, -.028))
    if normal.dot(outward) < 0:
        normal = -normal
    v = normal.cross(u).normalized()
    projected = [[Vector(((point-center).dot(u), (point-center).dot(normal), (point-center).dot(v))) for point in tri] for tri in triangles]
    vertices = []
    radius = .023+.004*(.5+.5*math.sin(index*1.7))
    turn = index*1.23
    path = [Vector((math.cos(turn+.39+i*4.91/8)*radius, math.sin(turn+.39+i*4.91/8)*radius*.89)) for i in range(9)]
    for i, point in enumerate(path):
        direction = (path[min(i+1, 8)]-path[max(0, i-1)]).normalized()
        across = Vector((-direction.y, direction.x))
        width = .0012 if i in [0, 8] else .0024
        for sign in [-1, 1]:
            uv = point+across*(width*sign)
            depth = _halo_project(projected, uv.x, uv.y)
            if depth is None:
                raise ValueError('Halo curl mark %d lies outside the closed mantle'%index)
            vertices.append(tuple(center+u*uv.x+v*uv.y+normal*(depth+.001)))
    crease = mesh('Halo painted C curl %02d'%index, vertices, [(i*2, i*2+1, i*2+3, i*2+2) for i in range(8)], hair, parent)
    _halo_pigment(crease, [.15+.025*math.sin(i*.91+index) for i in range(len(vertices))])


def build_halo_hair(parent):
    """One closed curl envelope with its return rim closed inside the head."""
    lobes = _halo_lobes()
    vertices, shades, faces, boundary = _halo_mantle(lobes)
    outer_faces = list(faces)
    # One hidden return fan closes the mantle inside the skull. Its anchor is
    # at the forehead lip's height, so the front underside returns into the
    # hairline instead of extending a diagonal dark wedge down the face.
    center = len(vertices)
    vertices.append((0, .105, -.005))
    shades.append(.58)
    faces += [(b, a, center) for a, b in boundary]
    mantle = smooth(mesh('Halo continuous scalloped curl mantle', vertices, faces, hair, parent))
    _halo_pigment(mantle, shades)
    # Flatten the hidden closure only. The outer surface has coherent smooth
    # normals so broad cel lighting does not expose a tiled polygon pattern.
    for poly in mantle.data.polygons[len(outer_faces):]:
        poly.use_smooth = False
    points = [Vector(vertex) for vertex in vertices]
    triangles = [[points[face[0]], points[face[i]], points[face[i+1]]] for face in outer_faces for i in range(1, len(face)-1)]
    # Ink curls sit on chosen lobe crests, so the accent explains that curl
    # mass instead of appearing as an unrelated mark between two clumps.
    for index, lobe_index in enumerate([2, 5, 7, 10, 13, 16, 19, 22, 25, 28, 34, 39]):
        axis = lobes[lobe_index][0]
        _halo_curl(parent, index, triangles, math.atan2(axis.x, axis.z), math.acos(axis.y), lobes)
