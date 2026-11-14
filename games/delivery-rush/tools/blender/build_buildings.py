# DELIVERY RUSH - modular buildings (instanced in the game with per-instance colours).
# Front of every building faces -Y (the street side); origin at ground centre of the footprint.
# Materials: wall (tinted per instance), roof (tinted per instance), trim, window (glows at
# night), door, awning (tinted), signboard (gets a name texture in the game), metal.
import math

def BM():
    return dict(
        wall=mat("wall", hexc("#ffffff"), rough=0.85),
        roof=mat("roof", hexc("#ffffff"), rough=0.7),
        trim=mat("trim", hexc("#f4f1ea"), rough=0.7),
        win=mat("window", hexc("#6fa8dc"), rough=0.1, metal=0.2, emit=hexc("#ffd88a"), emit_strength=0.0),
        door=mat("door", hexc("#7a4b2a"), rough=0.6),
        dark=mat("dark", hexc("#2b2f36"), rough=0.6),
        metal=mat("metal", hexc("#9aa3ad"), rough=0.4, metal=0.6),
    )


def windows_row(mb, m, w, y, z, n, ww=1.1, wh=1.3, sill=True):
    for i in range(n):
        x = -w / 2 + (i + 0.5) * w / n
        mb.box((ww, 0.08, wh), (x, y, z), m['win'])
        mb.box((ww + 0.2, 0.12, 0.12), (x, y - 0.02, z - wh / 2 - 0.06), m['trim'])
        if sill:
            mb.box((ww + 0.2, 0.1, 0.1), (x, y - 0.01, z + wh / 2 + 0.05), m['trim'])


def side_windows(mb, m, d, x, z, n, ww=1.1, wh=1.3):
    for i in range(n):
        y = -d / 2 + (i + 0.5) * d / n
        mb.box((0.08, ww, wh), (x, y, z), m['win'])


def house(kind):
    clear_scene()
    m = BM()
    root = empty("house_" + kind)
    mb = MB()
    if kind == "a":                      # two storey with gable roof and porch
        W, D, H = 9.0, 8.0, 5.8
        mb.box((W, D, H), (0, 0, H / 2), m['wall'], bevel=0.05)
        mb.box((W + 0.2, D + 0.2, 0.3), (0, 0, 0.15), m['trim'])
        windows_row(mb, m, W, -D / 2 - 0.02, 1.6, 2)
        windows_row(mb, m, W, -D / 2 - 0.02, 4.3, 3)
        windows_row(mb, m, W, D / 2 + 0.02, 1.6, 3)
        windows_row(mb, m, W, D / 2 + 0.02, 4.3, 3)
        for x in (W / 2 + 0.02, -W / 2 - 0.02):
            side_windows(mb, m, D, x, 4.3, 2)
        mb.box((1.2, 0.12, 2.2), (0, -D / 2 - 0.05, 1.1), m['door'])
        mb.box((3.2, 1.8, 0.2), (0, -D / 2 - 0.9, 2.9), m['trim'])                # porch roof
        for x in (-1.45, 1.45):
            mb.box((0.18, 0.18, 2.8), (x, -D / 2 - 1.65, 1.4), m['trim'])
        mb.box((3.2, 1.8, 0.2), (0, -D / 2 - 0.9, 0.1), m['trim'])
        mb.finish("house_walls", parent=root)
        r = MB()
        r.prism(D + 0.8, W + 0.8, 3.0, (0, 0, H), m['roof'], rot=(0, 0, 90))
        r.box((0.9, 0.9, 2.6), (W * 0.28, D * 0.15, H + 2.0), m['roof'])
        r.finish("house_roof", parent=root)
    elif kind == "b":                    # bungalow with garage
        W, D, H = 12.0, 8.0, 3.4
        mb.box((W, D, H), (0, 0, H / 2), m['wall'], bevel=0.05)
        mb.box((W + 0.2, D + 0.2, 0.3), (0, 0, 0.15), m['trim'])
        mb.box((3.4, 0.12, 2.5), (W / 2 - 2.2, -D / 2 - 0.05, 1.25), m['trim'])   # garage door
        for i in range(5):
            mb.box((3.3, 0.14, 0.05), (W / 2 - 2.2, -D / 2 - 0.08, 0.3 + i * 0.5), m['dark'])
        mb.box((1.1, 0.12, 2.2), (-0.5, -D / 2 - 0.05, 1.1), m['door'])
        for x in (-3.2, -4.9):
            mb.box((1.3, 0.08, 1.2), (x, -D / 2 - 0.02, 1.7), m['win'])
            mb.box((1.5, 0.12, 0.12), (x, -D / 2 - 0.04, 1.04), m['trim'])
        windows_row(mb, m, W, D / 2 + 0.02, 1.7, 4)
        for x in (W / 2 + 0.02, -W / 2 - 0.02):
            side_windows(mb, m, D, x, 1.7, 2)
        mb.finish("house_walls", parent=root)
        r = MB()
        r.prism(D + 1.0, W + 0.8, 2.4, (0, 0, H), m['roof'], rot=(0, 0, 90))
        r.finish("house_roof", parent=root)
    else:                                # townhouse with flat roof
        W, D, H = 7.5, 9.0, 7.0
        mb.box((W, D, H), (0, 0, H / 2), m['wall'], bevel=0.05)
        mb.box((W + 0.3, D + 0.3, 0.4), (0, 0, H + 0.2), m['trim'])
        mb.box((W + 0.2, D + 0.2, 0.3), (0, 0, 0.15), m['trim'])
        windows_row(mb, m, W, -D / 2 - 0.02, 1.7, 2, ww=1.4, wh=1.5)
        windows_row(mb, m, W, -D / 2 - 0.02, 4.9, 2, ww=1.4, wh=1.5)
        windows_row(mb, m, W, D / 2 + 0.02, 3.3, 2, ww=1.4, wh=1.5)
        mb.box((1.2, 0.12, 2.3), (0, -D / 2 - 0.05, 1.15), m['door'])
        mb.box((2.0, 1.0, 0.15), (0, -D / 2 - 0.5, 2.6), m['trim'])
        mb.box((2.2, 0.9, 0.12), (0, -D / 2 - 0.45, 3.5), m['dark'])               # balcony
        mb.finish("house_walls", parent=root)
        r = MB()
        r.box((W - 0.4, D - 0.4, 0.15), (0, 0, H + 0.05), m['roof'])
        r.box((1.4, 1.4, 1.0), (1.5, 2.0, H + 0.5), m['roof'], bevel=0.05)
        r.finish("house_roof", parent=root)
    return export_glb(root, "models/buildings/house_%s.glb" % kind), tri_count(root)


def shop(kind):
    """Two storey shop / restaurant. kind: 'shop' or 'restaurant'."""
    clear_scene()
    m = BM()
    aw = mat("awning", hexc("#ffffff"), rough=0.7)
    sign = mat("signboard", hexc("#ffffff"), rough=0.6, emit=hexc("#ffffff"), emit_strength=0.0)
    root = empty(kind)
    W, D, H = 12.0, 10.0, 8.0
    mb = MB()
    mb.box((W, D, H), (0, 0, H / 2), m['wall'], bevel=0.05)
    mb.box((W + 0.3, D + 0.3, 0.45), (0, 0, H + 0.2), m['trim'])
    # shop window + door
    mb.box((W - 1.0, 0.1, 2.6), (0, -D / 2 - 0.03, 1.75), m['win'])
    for x in (-3.5, 0.0, 3.5):
        mb.box((0.14, 0.16, 2.7), (x, -D / 2 - 0.06, 1.75), m['dark'])
    mb.box((W - 0.8, 0.18, 0.18), (0, -D / 2 - 0.06, 0.4), m['dark'])
    mb.box((1.6, 0.14, 2.4), (-1.75, -D / 2 - 0.08, 1.2), m['door'] if kind == "restaurant" else m['dark'])
    windows_row(mb, m, W, -D / 2 - 0.02, 5.6, 4, ww=1.5, wh=1.6)
    windows_row(mb, m, W, D / 2 + 0.02, 5.6, 4, ww=1.5, wh=1.6)
    for x in (W / 2 + 0.02, -W / 2 - 0.02):
        side_windows(mb, m, D, x, 5.6, 3, ww=1.5, wh=1.6)
    mb.box((W * 0.7, 0.4, 0.35), (0, D * 0.2, H + 0.6), m['metal'])                 # roof AC unit
    mb.finish(kind + "_walls", parent=root)
    a = MB()
    if kind == "restaurant":       # striped awning: alternate stripes (the game tints 'awning')
        n = 8
        for i in range(n):
            a.box((W / n, 2.2, 0.12), (-W / 2 + (i + 0.5) * W / n, -D / 2 - 1.0, 3.55),
                  aw if i % 2 == 0 else m['trim'], rot=(-18, 0, 0))
    else:
        a.box((W - 0.4, 2.0, 0.12), (0, -D / 2 - 0.95, 3.55), aw, rot=(-18, 0, 0))
        a.box((W - 0.4, 0.08, 0.4), (0, -D / 2 - 1.9, 3.1), aw)
    a.finish(kind + "_awning", parent=root)
    s = MB()
    s.box((W * 0.75, 0.15, 1.1), (0, -D / 2 - 0.1, 4.55), sign)
    s.finish(kind + "_sign", parent=root)
    return export_glb(root, "models/buildings/%s.glb" % kind), tri_count(root)


def warehouse():
    clear_scene()
    m = BM()
    root = empty("warehouse")
    W, D, H = 30.0, 20.0, 9.0
    mb = MB()
    mb.box((W, D, H), (0, 0, H / 2), m['wall'])
    for i in range(31):                                     # corrugation ribs on the long sides
        x = -W / 2 + i * W / 30
        for y in (-D / 2 - 0.05, D / 2 + 0.05):
            mb.box((0.18, 0.1, H - 0.2), (x, y, H / 2), m['wall'])
    for i in range(3):                                      # roll-up doors
        x = -W / 3 + i * W / 3
        mb.box((5.0, 0.2, 5.5), (x, -D / 2 - 0.12, 2.75), m['metal'])
        for k in range(10):
            mb.box((5.0, 0.24, 0.06), (x, -D / 2 - 0.14, 0.4 + k * 0.52), m['dark'])
        mb.box((5.6, 0.3, 0.3), (x, -D / 2 - 0.15, 5.65), m['dark'])
        mb.box((5.4, 1.4, 1.2), (x, -D / 2 - 0.7, 0.6), m['dark'])          # loading dock
    mb.box((1.2, 0.15, 2.3), (W / 2 - 2, -D / 2 - 0.1, 1.15), m['door'])
    windows_row(mb, m, W, -D / 2 - 0.08, 7.4, 6, ww=2.4, wh=0.9, sill=False)
    mb.finish("warehouse_walls", parent=root)
    r = MB()
    r.prism(D + 0.6, W + 0.6, 1.6, (0, 0, H), m['roof'], rot=(0, 0, 90))
    r.finish("warehouse_roof", parent=root)
    return export_glb(root, "models/buildings/warehouse.glb"), tri_count(root)


def hangar():
    clear_scene()
    m = BM()
    root = empty("hangar")
    W, D, R = 40.0, 36.0, 15.0
    mb = MB()
    mb.box((W, D, 4.0), (0, 0, 2.0), m['wall'])
    mb.box((W - 6, 0.3, 10.5), (0, -D / 2 - 0.05, 5.25), m['dark'])          # big open door
    mb.box((W, 0.5, 1.0), (0, -D / 2 - 0.1, 0.5), m['metal'])
    mb.finish("hangar_walls", parent=root)
    r = MB()
    n = 12
    for i in range(n):
        a0 = math.pi * i / n
        a1 = math.pi * (i + 1) / n
        am = (a0 + a1) / 2
        x = math.cos(am) * (W / 2)
        z = 4.0 + math.sin(am) * R
        seg = math.hypot(math.cos(a1) * W / 2 - math.cos(a0) * W / 2, (math.sin(a1) - math.sin(a0)) * R)
        ang = math.degrees(math.atan2((math.sin(a1) - math.sin(a0)) * R, (math.cos(a1) - math.cos(a0)) * W / 2))
        r.box((seg + 0.15, D + 0.4, 0.35), (x, 0, z), m['roof'], rot=(0, -ang, 0))
    # end walls (fan of triangles approximated by stacked boxes)
    for k in range(10):
        z = 4.0 + (k + 0.5) * R / 10
        w = W * math.sqrt(max(0.0, 1 - ((k + 0.5) / 10) ** 2))
        r.box((w, 0.3, R / 10 + 0.05), (0, D / 2, z), m['wall'])
        r.box((w, 0.3, R / 10 + 0.05), (0, -D / 2 - 0.02, z), m['wall'] if w > W - 6 else m['wall'])
    r.finish("hangar_roof", parent=root)
    return export_glb(root, "models/buildings/hangar.glb"), tri_count(root)


def control_tower():
    clear_scene()
    m = BM()
    root = empty("control_tower")
    mb = MB()
    mb.box((10, 10, 6), (0, 0, 3), m['wall'], bevel=0.1)
    mb.cyl(2.6, 26, (0, 0, 19), m['wall'], verts=12)
    mb.cyl(5.0, 0.8, (0, 0, 32.4), m['trim'], verts=12)
    mb.cyl(4.8, 3.6, (0, 0, 34.6), m['win'], verts=12, r2=5.4, smooth=False)
    mb.cyl(5.8, 0.6, (0, 0, 36.7), m['trim'], verts=12)
    mb.cyl(0.15, 5.0, (0, 0, 39.5), m['metal'], verts=6)
    mb.finish("tower_walls", parent=root)
    b = MB()
    b.sphere(0.35, (0, 0, 42.1), mat("beacon", hexc("#ff3b30"), emit=hexc("#ff3b30"), emit_strength=3.0), seg=8, rings=5)
    b.finish("tower_beacon", parent=root)
    return export_glb(root, "models/buildings/control_tower.glb"), tri_count(root)


def garage_building():
    """The player's garage (HQ): wide building with 3 bays and a big sign."""
    clear_scene()
    m = BM()
    root = empty("garage")
    org = mat("awning", hexc("#ff7a1f"), rough=0.5)
    sign = mat("signboard", hexc("#ffffff"), rough=0.6, emit=hexc("#ffffff"), emit_strength=0.0)
    W, D, H = 24.0, 16.0, 7.0
    mb = MB()
    mb.box((W, D, H), (0, 0, H / 2), m['wall'], bevel=0.08)
    mb.box((W + 0.4, D + 0.4, 0.5), (0, 0, H + 0.25), org)
    for i in range(3):
        x = -W / 3 + i * W / 3
        mb.box((6.0, 0.2, 4.6), (x, -D / 2 - 0.1, 2.3), m['metal'])
        for k in range(8):
            mb.box((6.0, 0.24, 0.06), (x, -D / 2 - 0.12, 0.4 + k * 0.55), m['dark'])
        mb.box((6.6, 0.4, 0.4), (x, -D / 2 - 0.2, 4.8), org)
    mb.finish("garage_walls", parent=root)
    s = MB()
    s.box((W * 0.6, 0.2, 1.4), (0, -D / 2 - 0.2, 6.0), sign)
    s.finish("garage_sign", parent=root)
    return export_glb(root, "models/buildings/garage.glb"), tri_count(root)


def dealership():
    """Vehicle dealership: glass showroom with a canopy."""
    clear_scene()
    m = BM()
    root = empty("dealership")
    blue = mat("awning", hexc("#3a86ff"), rough=0.5)
    sign = mat("signboard", hexc("#ffffff"), rough=0.6, emit=hexc("#ffffff"), emit_strength=0.0)
    W, D, H = 26.0, 18.0, 8.0
    mb = MB()
    mb.box((W, D, 0.4), (0, 0, 0.2), m['trim'])
    mb.box((W - 1, D - 1, H - 0.6), (0, 0.5, H / 2), m['win'])           # glass box
    for i in range(7):
        x = -W / 2 + 0.5 + i * (W - 1) / 6
        mb.box((0.3, 0.3, H), (x, -D / 2 + 0.5, H / 2), m['dark'])
    mb.box((W, D, 0.8), (0, 0, H), blue, bevel=0.1)
    mb.box((W * 0.4, 6, 0.4), (0, -D / 2 - 2.5, 5.5), blue, bevel=0.05)  # entrance canopy
    for x in (-W * 0.18, W * 0.18):
        mb.box((0.3, 0.3, 5.5), (x, -D / 2 - 5.2, 2.75), m['dark'])
    mb.finish("dealership_walls", parent=root)
    s = MB()
    s.box((W * 0.55, 0.2, 1.4), (0, -D / 2 - 0.15, H + 1.2), sign)
    s.finish("dealership_sign", parent=root)
    return export_glb(root, "models/buildings/dealership.glb"), tri_count(root)
