"""Starstruck: open star and crescent frames from the four-view concept.

Geometry is authored directly in the reference head socket, Y-up/+Z-forward.
Rims, bridge and nose pads declare front fitting; wrapped arms declare side
fitting. There are no lenses, hair cutters or per-head variants.
"""


def _starstruck_rim(parent, name, centre, outer, inner, gold):
    """A closed annular frame with bevels on both edges of its front face."""
    x, y, z = centre
    count = len(outer)
    vertices = []
    for kind in ('outer-back', 'outer-front', 'inner-front', 'inner-back'):
        for outside, inside in zip(outer, inner):
            if kind == 'outer-back':
                px, py = outside
                depth = -.0035
            elif kind == 'outer-front':
                px = outside[0]*.88+inside[0]*.12
                py = outside[1]*.88+inside[1]*.12
                depth = .0035
            elif kind == 'inner-front':
                px = inside[0]*.90+outside[0]*.10
                py = inside[1]*.90+outside[1]*.10
                depth = .0035
            else:
                px, py = inside
                depth = -.0035
            vertices.append((x+px, y+py, z+depth))
    faces = []
    for ring in range(4):
        following = (ring+1) % 4
        for column in range(count):
            next_column = (column+1) % count
            faces.append((ring*count+column, ring*count+next_column,
                          following*count+next_column, following*count+column))
    obj = mesh(name, vertices, faces, gold, parent)
    obj['fitRole'] = 'front'
    return obj


def _starstruck_temple(parent, name, points, gold, teal):
    obj = tube_path(name, points, .0037, gold, parent)
    obj['fitRole'] = 'side'
    obj.data.materials.append(teal)
    # The final hook segment is a fitted teal sleeve within the same arm mesh.
    # Its material boundary does not duplicate geometry or create a gap.
    last_segment = (len(points)-2)*6
    for polygon in obj.data.polygons:
        if last_segment <= polygon.index < (len(points)-1)*6:
            polygon.material_index = 1
    obj.data.polygons[-1].material_index = 1
    return obj


def build_starstruck(parent):
    gold = mat('Starstruck original gold', '#e6b441')
    teal = mat('Starstruck original teal', '#248b91')
    # These materials intentionally have no clothing palette channel. Changing
    # a shirt or its secondary colour cannot recolour this authored accessory.
    star_outer = []
    star_inner = []
    for i in range(10):
        a = math.pi/2+i*math.tau/10
        outside = .066 if i % 2 == 0 else .040
        inside = .053 if i % 2 == 0 else .031
        star_outer.append((math.cos(a)*outside, math.sin(a)*outside))
        star_inner.append((math.cos(a)*inside, math.sin(a)*inside))
    _starstruck_rim(parent, 'Starstruck open five-point star',
                   (-.073, .023, .230), star_outer, star_inner, gold)

    # The moon has a broad upper crescent, a thin oval eye surround, and two
    # deliberate horn tips. Its hole stays an oval, never a filled eye plate.
    moon_outer = [
        (.050, .000), (.043, .028), (.035, .044), (.063, .092),
        (.018, .086), (-.017, .076), (-.041, .054), (-.057, .030),
        (-.062, .000), (-.055, -.028), (-.033, -.051), (-.004, -.058),
        (.023, -.056), (.075, -.046), (.045, -.028),
    ]
    moon_inner = []
    for x, y in moon_outer:
        a = math.atan2(y+.009, x)
        moon_inner.append((math.cos(a)*.038, -.009+math.sin(a)*.040))
    _starstruck_rim(parent, 'Starstruck open crescent moon',
                   (.073, .023, .230), moon_outer, moon_inner, gold)

    bridge = tube_path('Starstruck curved nose bridge', [
        (-.027, .026, .228), (-.014, .034, .231), (0, .037, .233),
        (.013, .034, .231), (.025, .026, .228),
    ], .0038, gold, parent)
    bridge['fitRole'] = 'front'
    for side in (-1, 1):
        pad = ico('Starstruck teal nose pad',
                  (side*.030, .006, .224), (.0035, .008, .003), teal, parent, 1)
        pad['fitRole'] = 'front'

    # Front endpoints follow the deliberately mismatched rim heights. The rest
    # follows the qualified round-glasses path in native reference-head units,
    # with the same gentle outward bend and hooked ear ends.
    _starstruck_temple(parent, 'Starstruck left wrapped arm', [
        (-.134, .041, .230), (-.155, .038, .223), (-.171, .030, .214),
        (-.1885, .027, .1244), (-.1862, .0108, .0324),
        (-.185, -.014, -.038), (-.1824, -.038, -.064),
    ], gold, teal)
    _starstruck_temple(parent, 'Starstruck right wrapped arm', [
        (.123, .026, .230), (.151, .026, .226), (.170, .027, .214),
        (.1885, .027, .1244), (.1862, .0108, .0324),
        (.185, -.014, -.038), (.1824, -.038, -.064),
    ], gold, teal)
    for x, y in [(-.134, .041), (.125, .026)]:
        hinge = box('Starstruck small gold hinge', (x, y, .230),
                    (.008, .010, .010), gold, parent, bevel=0)
        hinge['fitRole'] = 'front'
