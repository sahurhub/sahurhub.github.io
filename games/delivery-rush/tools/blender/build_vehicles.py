# DELIVERY RUSH - player vehicles and traffic cars.
# Conventions (Blender space): forward = -Y, left = +X, ground at z = 0.
# Node names the game relies on:
#   body                      static mesh (materials: paint, paint2, trim, chrome, glass,
#                             headlight, brakelight, tire, rim, seat)
#   wheel_F / wheel_R         bike wheels (origin = axle, spin about local X)
#   wheel_FL/FR/ML/MR/RL/RR   car wheels
#   steer_F                   bikes: steering pivot (local Z = steering axis) holding fork + front wheel
#   seat                      where the rider's hips go
#   cargo                     centre of the cargo floor; its SCALE = (width, length, max height)
#   headlamp, exhaust         empties for the headlight beam and exhaust smoke
import math

def M():
    return dict(
        tire=mat("tire", hexc("#24262b"), rough=0.9),
        rim=mat("rim", hexc("#c9ced6"), rough=0.3, metal=0.8),
        trim=mat("trim", hexc("#2b2f36"), rough=0.6),
        chrome=mat("chrome", hexc("#dfe4ea"), rough=0.15, metal=1.0),
        glass=mat("glass", hexc("#203248"), rough=0.08, metal=0.3),
        head=mat("headlight", hexc("#fff6d6"), emit=hexc("#fff3c8"), emit_strength=0.0),
        brake=mat("brakelight", hexc("#c4161c"), emit=hexc("#ff2a2a"), emit_strength=0.0),
        amber=mat("indicator", hexc("#ff9d1a"), emit=hexc("#ff9d1a"), emit_strength=0.0),
        seat=mat("seat", hexc("#1e2025"), rough=0.7),
    )


def cargo_empty(root, loc, w, l, h):
    e = empty("cargo", loc, root)
    e.scale = (w, l, h)
    return e


def steer_node(root, top, axle):
    """Steering pivot at `top`, local Z pointing from the axle to the top (rake)."""
    d = Vector(top) - Vector(axle)
    ang = math.atan2(d.y, d.z)          # positive when the top leans back (+Y)
    e = empty("steer_F", top, root)
    e.rotation_euler = (-ang, 0, 0)
    bpy.context.view_layer.update()
    return e


def finish_vehicle(root, rel):
    return export_glb(root, "models/vehicles/%s.glb" % rel), tri_count(root)

# ------------------------------------------------------------------ pedal bikes

def pedal_bike(kind):
    clear_scene()
    m = M()
    root = empty(kind)
    if kind == "bicycle":
        paint = mat("paint", hexc("#2ec4b6"), rough=0.4, metal=0.2)
        paint2 = mat("paint2", hexc("#f4f1ea"), rough=0.5)
        r, tw, wb, seat_z = 0.34, 0.065, 1.06, 0.98
        knobby = False
    elif kind == "bmx":
        paint = mat("paint", hexc("#ff3d7f"), rough=0.35, metal=0.3)
        paint2 = mat("paint2", hexc("#ffd23f"), rough=0.5)
        r, tw, wb, seat_z = 0.27, 0.1, 0.92, 0.80
        knobby = True
    else:  # mtb
        paint = mat("paint", hexc("#3a86ff"), rough=0.35, metal=0.3)
        paint2 = mat("paint2", hexc("#ff8c1a"), rough=0.5)
        r, tw, wb, seat_z = 0.37, 0.1, 1.1, 1.02
        knobby = True
    fy, ry = -wb / 2, wb / 2                     # axle Y positions
    head_top = (0, fy + 0.13, r + (0.62 if kind != "bmx" else 0.48))
    head_bot = (0, fy + 0.07, r + 0.33 if kind != "bmx" else r + 0.22)
    bb = (0, 0.02, r * 0.9 if kind != "bmx" else r + 0.02)      # bottom bracket
    seat_post = (0, ry - 0.36, seat_z - 0.08)
    mb = MB()
    # frame
    mb.tube(bb, seat_post, 0.032, paint)
    if kind == "bicycle":                       # step-through: low down tube
        mb.tube(head_bot, (0, bb[1] - 0.05, bb[2] + 0.05), 0.034, paint)
        mb.tube((0, head_bot[1] + 0.03, head_bot[2] + 0.12), (0, seat_post[1] + 0.04, seat_post[2] - 0.28), 0.03, paint)
    else:
        mb.tube(head_bot, bb, 0.036, paint)
        mb.tube(head_top, (0, seat_post[1], seat_post[2] - 0.04), 0.032, paint)
    for x in (0.06, -0.06):
        mb.tube((x, bb[1], bb[2]), (x, ry, r), 0.018, paint)                # chain stays
        mb.tube((x, seat_post[1] + 0.02, seat_post[2] - 0.06), (x, ry, r), 0.018, paint)  # seat stays
    mb.tube(seat_post, (0, seat_post[1] + 0.03, seat_z), 0.02, m['chrome'])
    mb.box((0.16, 0.28, 0.07), (0, seat_post[1] + 0.03, seat_z + 0.02), m['seat'], bevel=0.03)
    # crank + pedals (static)
    mb.cyl(0.1, 0.02, (0.075, bb[1], bb[2]), m['chrome'], axis='X', verts=12, smooth=False)
    mb.cyl(0.03, 0.18, bb, m['trim'], axis='X', verts=8)
    for x, dz in ((0.13, 0.13), (-0.13, -0.13)):
        mb.box((0.09, 0.1, 0.025), (x, bb[1], bb[2] + dz), m['trim'])
    # rear rack (cargo)
    rack_z = r + 0.38 if kind != "bmx" else r + 0.3
    rack_y0, rack_y1 = ry - 0.32, ry + 0.16
    mb.box((0.3, rack_y1 - rack_y0, 0.025), (0, (rack_y0 + rack_y1) / 2, rack_z), m['trim'])
    for x in (0.13, -0.13):
        mb.tube((x, rack_y1 - 0.04, rack_z), (x, ry, r), 0.012, m['trim'])
    # mudguards
    if kind == "bicycle":
        mb.box((0.09, 0.5, 0.02), (0, ry + 0.06, r + r * 0.98), paint2, rot=(-12, 0, 0))
    # rear light
    mb.box((0.06, 0.03, 0.04), (0, rack_y1 + 0.01, rack_z - 0.03), m['brake'])
    if kind == "mtb":    # panniers
        for x in (0.17, -0.17):
            mb.box((0.06, 0.34, 0.26), (x, (rack_y0 + rack_y1) / 2, rack_z - 0.15), paint2, bevel=0.025)
    if kind == "bmx":    # pegs
        for x in (0.11, -0.11):
            mb.cyl(0.025, 0.1, (x, ry, r), m['chrome'], axis='X', verts=8)
    mb.finish("body", parent=root)
    # steering assembly
    st = steer_node(root, head_top, (0, fy, r))
    sb = MB()
    sb.tube(head_top, head_bot, 0.04, paint)                                # head tube
    fork_r = 0.022 if kind != "mtb" else 0.03
    for x in (0.055, -0.055):
        sb.tube((x, head_bot[1], head_bot[2]), (x, fy, r), fork_r, paint2 if kind == "mtb" else paint)
    stem_top = (0, head_top[1] - 0.02, head_top[2] + (0.12 if kind != "bmx" else 0.2))
    sb.tube(head_top, stem_top, 0.022, m['chrome'])
    bar_w = 0.56 if kind != "bmx" else 0.62
    sb.cyl(0.018, bar_w, (0, stem_top[1] + 0.02, stem_top[2]), m['chrome'], axis='X', verts=8)
    if kind == "bmx":
        sb.cyl(0.014, 0.3, (0, stem_top[1] + 0.02, stem_top[2] - 0.1), m['chrome'], axis='X', verts=8)
        for x in (0.15, -0.15):
            sb.tube((x, stem_top[1] + 0.02, stem_top[2]), (x, head_top[1], head_top[2] - 0.02), 0.014, m['chrome'])
    for x in (bar_w / 2 - 0.05, -bar_w / 2 + 0.05):
        sb.cyl(0.026, 0.11, (x, stem_top[1] + 0.02, stem_top[2]), m['trim'], axis='X', verts=8)
    sb.box((0.08, 0.06, 0.06), (0, head_top[1] - 0.07, head_top[2] - 0.02), m['head'], bevel=0.015)
    if kind == "bicycle":   # front mudguard + basket frame
        sb.box((0.09, 0.42, 0.02), (0, fy - 0.03, r + r * 0.98), paint2, rot=(14, 0, 0))
    fork = sb.finish("fork")
    reparent_keep(fork, st)
    wf = wheel("wheel_F", r, tw, (0, fy, r), m['tire'], m['rim'], knobby=knobby, spokes=0 if kind == "bmx" else 4, hub=m['chrome'])
    reparent_keep(wf, st)
    wheel("wheel_R", r, tw, (0, ry, r), m['tire'], m['rim'], parent=root, knobby=knobby, spokes=0 if kind == "bmx" else 4, hub=m['chrome'])
    if kind == "bmx":   # BMX gets mag-style rims: add 5 thick spokes
        pass
    empty("seat", (0, seat_post[1] + 0.05, seat_z + 0.05), root)
    empty("headlamp", (0, head_top[1] - 0.1, head_top[2] - 0.02), root)
    cargo_empty(root, (0, (rack_y0 + rack_y1) / 2, rack_z + 0.015), 0.34, rack_y1 - rack_y0 + 0.04, 0.9)
    return finish_vehicle(root, kind)

# ------------------------------------------------------------------ e-scooter

def escooter():
    clear_scene()
    m = M()
    root = empty("escooter")
    paint = mat("paint", hexc("#7bd389"), rough=0.4, metal=0.2)
    paint2 = mat("paint2", hexc("#2b2f36"), rough=0.5)
    r, tw = 0.13, 0.07
    fy, ry = -0.5, 0.48
    deck_z = 0.15
    mb = MB()
    mb.box((0.2, 0.86, 0.06), (0, 0.0, deck_z), paint, bevel=0.02)
    mb.box((0.16, 0.7, 0.05), (0, 0.0, deck_z + 0.035), m['trim'])          # grip tape
    mb.box((0.14, 0.5, 0.06), (0, 0.0, deck_z - 0.06), paint2, bevel=0.02)  # battery
    mb.box((0.1, 0.32, 0.03), (0, ry + 0.02, r * 2 + 0.04), paint, rot=(-10, 0, 0))   # rear fender
    mb.box((0.06, 0.03, 0.03), (0, ry + 0.17, r * 2 + 0.0), m['brake'])
    mb.tube((0, -0.4, deck_z), (0, fy + 0.06, r + 0.12), 0.03, paint)      # neck
    rack_y0, rack_y1 = ry - 0.12, ry + 0.2
    rz = 0.42
    mb.box((0.26, rack_y1 - rack_y0, 0.02), (0, (rack_y0 + rack_y1) / 2, rz), m['trim'])
    for x in (0.1, -0.1):
        mb.tube((x, rack_y0 + 0.02, rz), (x, ry - 0.12, deck_z + 0.03), 0.012, m['trim'])
        mb.tube((x, rack_y1 - 0.02, rz), (x, ry + 0.05, r + 0.05), 0.012, m['trim'])
    mb.finish("body", parent=root)
    top = (0, fy + 0.12, 1.08)
    st = steer_node(root, top, (0, fy, r))
    sb = MB()
    sb.tube(top, (0, fy + 0.02, r + 0.1), 0.03, paint)
    for x in (0.045, -0.045):
        sb.tube((x, fy + 0.02, r + 0.1), (x, fy, r), 0.016, paint2)
    sb.cyl(0.018, 0.5, top, m['chrome'], axis='X', verts=8)
    for x in (0.21, -0.21):
        sb.cyl(0.024, 0.1, (x, top[1], top[2]), m['trim'], axis='X', verts=8)
    sb.box((0.07, 0.05, 0.05), (0, fy + 0.03, 0.62), m['head'], bevel=0.015)
    sb.box((0.12, 0.02, 0.06), (0, top[1] + 0.03, top[2] + 0.02), m['glass'])   # display
    fork = sb.finish("fork")
    reparent_keep(fork, st)
    wf = wheel("wheel_F", r, tw, (0, fy, r), m['tire'], m['rim'], hub=m['chrome'])
    reparent_keep(wf, st)
    wheel("wheel_R", r, tw, (0, ry, r), m['tire'], m['rim'], parent=root, hub=m['chrome'])
    empty("seat", (0, 0.05, deck_z + 0.04 + 0.72), root)    # standing rider: hips above the deck
    empty("headlamp", (0, fy - 0.02, 0.62), root)
    cargo_empty(root, (0, (rack_y0 + rack_y1) / 2, rz + 0.01), 0.3, rack_y1 - rack_y0 + 0.02, 0.9)
    return finish_vehicle(root, "escooter")

# ------------------------------------------------------------------ moped

def moped():
    clear_scene()
    m = M()
    root = empty("moped")
    paint = mat("paint", hexc("#ffb703"), rough=0.3, metal=0.1)
    paint2 = mat("paint2", hexc("#f4f1ea"), rough=0.4)
    r, tw = 0.24, 0.13
    fy, ry = -0.62, 0.6
    mb = MB()
    mb.box((0.34, 0.62, 0.08), (0, -0.05, 0.34), paint2, bevel=0.03)                 # floorboard
    mb.box((0.46, 0.75, 0.42), (0, 0.42, 0.62), paint, bevel=0.12, taper=(0.85, 0.9))  # rear body
    mb.box((0.34, 0.6, 0.12), (0, 0.32, 0.9), m['seat'], bevel=0.05)                 # seat
    mb.box((0.4, 0.5, 0.06), (0, 0.85, 0.82), m['trim'])                             # rack behind seat
    mb.box((0.2, 0.06, 0.06), (0, 0.82, 0.62), m['brake'], bevel=0.015)
    mb.box((0.28, 0.1, 0.32), (0, 0.66, 0.35), m['trim'], bevel=0.04)                # engine cover
    mb.cyl(0.04, 0.42, (-0.16, 0.65, 0.22), m['chrome'], axis='Y', verts=8)          # exhaust
    mb.box((0.12, 0.38, 0.04), (0, ry + 0.02, r * 2 + 0.05), paint, rot=(-8, 0, 0))  # rear fender
    mb.finish("body", parent=root)
    top = (0, fy + 0.28, 1.12)
    st = steer_node(root, top, (0, fy, r))
    sb = MB()
    sb.box((0.5, 0.12, 0.62), (0, fy + 0.22, 0.66), paint, bevel=0.08, rot=(-16, 0, 0))   # leg shield
    sb.box((0.14, 0.14, 0.42), (0, fy + 0.31, 0.98), paint, bevel=0.04, rot=(-16, 0, 0))  # column
    sb.box((0.62, 0.12, 0.08), (0, top[1], top[2]), paint2, bevel=0.03)                   # bars cowl
    sb.box((0.18, 0.06, 0.12), (0, top[1] - 0.08, top[2] - 0.02), m['head'], bevel=0.03)
    for x in (0.28, -0.28):
        sb.cyl(0.026, 0.12, (x, top[1], top[2]), m['trim'], axis='X', verts=8)
        sb.box((0.06, 0.03, 0.03), (x * 0.8, top[1] - 0.06, top[2]), m['amber'])
    sb.box((0.12, 0.34, 0.05), (0, fy - 0.02, r * 2 + 0.04), paint, rot=(10, 0, 0))     # front fender
    for x in (0.05, -0.05):
        sb.tube((x, fy + 0.18, 0.5), (x, fy, r), 0.02, m['chrome'])
    fork = sb.finish("fork")
    reparent_keep(fork, st)
    wf = wheel("wheel_F", r, tw, (0, fy, r), m['tire'], m['rim'], hub=m['chrome'])
    reparent_keep(wf, st)
    wheel("wheel_R", r, tw, (0, ry, r), m['tire'], m['rim'], parent=root, hub=m['chrome'])
    empty("seat", (0, 0.3, 0.96), root)
    empty("headlamp", (0, top[1] - 0.14, top[2] - 0.02), root)
    empty("exhaust", (-0.16, 0.88, 0.22), root)
    cargo_empty(root, (0, 0.85, 0.85), 0.42, 0.5, 1.0)
    return finish_vehicle(root, "moped")

# ------------------------------------------------------------------ motorbike

def motorbike():
    clear_scene()
    m = M()
    root = empty("motorbike")
    paint = mat("paint", hexc("#e63946"), rough=0.25, metal=0.3)
    paint2 = mat("paint2", hexc("#1d3557"), rough=0.4)
    r, tw = 0.33, 0.17
    fy, ry = -0.74, 0.72
    mb = MB()
    mb.box((0.3, 0.55, 0.3), (0, -0.12, 0.98), paint, bevel=0.1, taper=(0.8, 0.85))   # tank
    mb.box((0.32, 0.5, 0.36), (0, 0.02, 0.55), m['trim'], bevel=0.06)                # engine
    for i in range(3):
        mb.box((0.36, 0.04, 0.3), (0, -0.12 + i * 0.1, 0.56), m['chrome'])            # fins
    mb.box((0.3, 0.62, 0.11), (0, 0.38, 0.95), m['seat'], bevel=0.05)
    mb.box((0.28, 0.6, 0.18), (0, 0.6, 0.86), paint, bevel=0.06, rot=(-10, 0, 0))   # tail
    mb.box((0.18, 0.05, 0.06), (0, 0.92, 0.86), m['brake'], bevel=0.015)
    mb.tube((0, 0.2, 0.6), (0, ry, r), 0.04, paint2)                                 # swingarm
    mb.tube((0.14, 0.15, 0.35), (0.16, 0.86, 0.5), 0.05, m['chrome'])                # exhaust
    mb.cyl(0.07, 0.28, (0.16, 0.9, 0.52), m['chrome'], axis='Y', verts=10, rot=(-12, 0, 0))
    mb.box((0.46, 0.56, 0.06), (0, 0.9, 1.06), m['trim'])                            # box mount
    mb.finish("body", parent=root)
    top = (0, fy + 0.36, 1.12)
    st = steer_node(root, top, (0, fy, r))
    sb = MB()
    for x in (0.08, -0.08):
        sb.tube((x, top[1], top[2] - 0.05), (x, fy, r), 0.032, m['chrome'])
    sb.box((0.42, 0.3, 0.42), (0, top[1] - 0.12, top[2] - 0.04), paint, bevel=0.1, rot=(-20, 0, 0))  # fairing
    sb.box((0.3, 0.06, 0.22), (0, top[1] - 0.06, top[2] + 0.22), m['glass'], rot=(-35, 0, 0))       # windscreen
    sb.box((0.2, 0.06, 0.12), (0, top[1] - 0.28, top[2] - 0.08), m['head'], bevel=0.03)
    sb.cyl(0.02, 0.66, (0, top[1] + 0.06, top[2] + 0.04), m['chrome'], axis='X', verts=8)
    for x in (0.3, -0.3):
        sb.cyl(0.028, 0.12, (x, top[1] + 0.06, top[2] + 0.04), m['trim'], axis='X', verts=8)
    sb.box((0.14, 0.42, 0.05), (0, fy - 0.02, r * 2 + 0.05), paint, rot=(12, 0, 0))
    fork = sb.finish("fork")
    reparent_keep(fork, st)
    wf = wheel("wheel_F", r, tw, (0, fy, r), m['tire'], m['rim'], hub=m['chrome'])
    reparent_keep(wf, st)
    wheel("wheel_R", r, tw * 1.25, (0, ry, r), m['tire'], m['rim'], parent=root, hub=m['chrome'])
    empty("seat", (0, 0.36, 1.0), root)
    empty("headlamp", (0, top[1] - 0.32, top[2] - 0.08), root)
    empty("exhaust", (0.16, 1.04, 0.55), root)
    cargo_empty(root, (0, 0.9, 1.09), 0.46, 0.56, 1.1)
    return finish_vehicle(root, "motorbike")

# ------------------------------------------------------------------ vans and trucks

def four_wheels(root, m, r, w, track, ys, names):
    for (y, pre) in zip(ys, names):
        for side, x in (("L", track / 2), ("R", -track / 2)):
            wheel("wheel_%s%s" % (pre, side), r, w, (x, y, r), m['tire'], m['rim'], parent=root, hub=m['chrome'])


def lights_front(mb, m, w, y, z, size=(0.32, 0.06, 0.18)):
    for x in (w / 2 - size[0] / 2 - 0.06, -w / 2 + size[0] / 2 + 0.06):
        mb.box(size, (x, y, z), m['head'], bevel=0.03)


def lights_rear(mb, m, w, y, z, size=(0.12, 0.06, 0.3)):
    for x in (w / 2 - size[0] / 2 - 0.04, -w / 2 + size[0] / 2 + 0.04):
        mb.box(size, (x, y, z), m['brake'], bevel=0.02)


def roof_rack(mb, m, w, y0, y1, z):
    for x in (w / 2 - 0.05, -w / 2 + 0.05):
        mb.box((0.06, y1 - y0, 0.06), (x, (y0 + y1) / 2, z + 0.12), m['trim'])
        for y in (y0 + 0.05, (y0 + y1) / 2, y1 - 0.05):
            mb.box((0.05, 0.05, 0.14), (x, y, z + 0.05), m['trim'])
    n = int((y1 - y0) / 0.45)
    for i in range(n + 1):
        y = y0 + 0.05 + i * (y1 - y0 - 0.1) / max(n, 1)
        mb.box((w - 0.1, 0.05, 0.04), (0, y, z + 0.06), m['trim'])


def van(kind):
    clear_scene()
    m = M()
    root = empty(kind)
    if kind == "van_small":
        paint = mat("paint", hexc("#f4f1ea"), rough=0.35, metal=0.1)
        paint2 = mat("paint2", hexc("#ff7a1f"), rough=0.4)
        L, W, H, r, tw, wb = 4.3, 1.86, 2.0, 0.36, 0.26, 2.7
    else:
        paint = mat("paint", hexc("#ffd23f"), rough=0.35, metal=0.1)
        paint2 = mat("paint2", hexc("#2b59c3"), rough=0.4)
        L, W, H, r, tw, wb = 5.7, 2.06, 2.55, 0.4, 0.3, 3.6
    fy, ry = -wb / 2, wb / 2
    zb = 0.32                                       # body floor
    mb = MB()
    nose = 0.7 if kind == "van_small" else 0.85
    # main box
    mb.box((W, L - nose, H - zb), (0, nose / 2, zb + (H - zb) / 2), paint, bevel=0.12)
    # sloped nose / bonnet
    mb.box((W - 0.04, nose + 0.2, 0.62), (0, -L / 2 + nose / 2 + 0.05, zb + 0.4), paint, bevel=0.12, taper=(1, 0.75))
    # windscreen (sloped)
    ws_y = -L / 2 + nose + 0.02
    mb.box((W - 0.22, 0.06, 0.78), (0, ws_y - 0.12, H - 0.62), m['glass'], rot=(-18, 0, 0))
    # side windows (cab)
    for x in (W / 2 + 0.005, -W / 2 - 0.005):
        mb.box((0.03, 0.85, 0.6), (x, ws_y + 0.52, H - 0.62), m['glass'])
    # stripe band (paint2) along the cargo box
    for x in (W / 2 + 0.01, -W / 2 - 0.01):
        mb.box((0.02, L - nose - 1.25, 0.28), (x, nose / 2 + 0.55, zb + 0.75), paint2)
        mb.box((0.02, L - nose - 1.25, 0.1), (x, nose / 2 + 0.55, zb + 1.02), paint2)
    # bumpers, grille
    mb.box((W + 0.04, 0.18, 0.24), (0, -L / 2 - 0.02, 0.42), m['trim'], bevel=0.05)
    mb.box((W + 0.04, 0.18, 0.24), (0, L / 2 + 0.02, 0.42), m['trim'], bevel=0.05)
    mb.box((W * 0.5, 0.05, 0.22), (0, -L / 2 + 0.02, 0.72), m['trim'])
    lights_front(mb, m, W, -L / 2 + 0.04, 0.76)
    lights_rear(mb, m, W, L / 2 + 0.01, 0.95)
    mb.box((0.04, L / 2, 0.04), (W / 2 - 0.01, 0.1, 0.36), m['trim'])
    # rear doors line + handle
    mb.box((0.03, 0.02, H - zb - 0.3), (0, L / 2 + 0.005, zb + (H - zb) / 2), m['trim'])
    # wheel arches (dark)
    for y in (fy, ry):
        for x in (W / 2 + 0.005, -W / 2 - 0.005):
            mb.box((0.03, r * 2.3, r * 1.2), (x, y, r + 0.05), m['trim'], bevel=0.02)
    # mirrors
    for x in (W / 2 + 0.12, -W / 2 - 0.12):
        mb.box((0.06, 0.12, 0.2), (x, ws_y + 0.05, H - 0.85), m['trim'], bevel=0.02)
    rr_y0, rr_y1 = ws_y + 0.3, L / 2 - 0.15
    roof_rack(mb, m, W - 0.1, rr_y0, rr_y1, H)
    mb.box((0.5, 0.12, 0.08), (0, ws_y + 0.12, H + 0.02), m['amber'])          # roof beacon bar
    mb.finish("body", parent=root)
    four_wheels(root, m, r, tw, W - tw - 0.04, (fy, ry), ("F", "R"))
    empty("seat", (W / 2 - 0.5, ws_y + 0.55, zb + 0.72), root)
    empty("headlamp", (0, -L / 2 - 0.05, 0.76), root)
    empty("exhaust", (-W / 2 + 0.3, L / 2 + 0.1, 0.3), root)
    cargo_empty(root, (0, (rr_y0 + rr_y1) / 2, H + 0.1), W - 0.25, rr_y1 - rr_y0 - 0.1, 1.2)
    return finish_vehicle(root, kind)


def truck(kind):
    clear_scene()
    m = M()
    root = empty(kind)
    big = kind == "truck_super"
    if big:
        paint = mat("paint", hexc("#7b2cbf"), rough=0.25, metal=0.3)
        paint2 = mat("paint2", hexc("#c0c6cf"), rough=0.3, metal=0.6)
        W, cabL, cabH, r, tw = 2.5, 2.9, 3.4, 0.55, 0.36
        axles = (-3.6, 1.7, 3.15)
        bedL, bedZ = 7.0, 1.3
    else:
        paint = mat("paint", hexc("#2a9d8f"), rough=0.3, metal=0.2)
        paint2 = mat("paint2", hexc("#f4f1ea"), rough=0.4)
        W, cabL, cabH, r, tw = 2.3, 2.2, 2.85, 0.48, 0.32
        axles = (-2.5, 1.9)
        bedL, bedZ = 4.9, 1.15
    front = axles[0] - 1.0
    cab_y0, cab_y1 = front, front + cabL
    mb = MB()
    # chassis
    mb.box((W * 0.7, axles[-1] - front + 1.0, 0.3), (0, (front + axles[-1] + 1.0) / 2 + 0.3, r + 0.1), m['trim'])
    # cab
    zc = r * 0.9
    mb.box((W, cabL, cabH - zc), (0, (cab_y0 + cab_y1) / 2, zc + (cabH - zc) / 2), paint, bevel=0.14)
    mb.box((W - 0.2, 0.06, 0.95), (0, cab_y0 - 0.02, cabH - 0.72), m['glass'], rot=(-6, 0, 0))
    for x in (W / 2 + 0.005, -W / 2 - 0.005):
        mb.box((0.03, cabL * 0.42, 0.75), (x, cab_y0 + cabL * 0.3, cabH - 0.72), m['glass'])
        mb.box((0.02, cabL * 0.9, 0.18), (x, (cab_y0 + cab_y1) / 2, zc + 0.6), paint2)
    # grille + bumper + lights
    mb.box((W * 0.62, 0.06, 0.75), (0, cab_y0 - 0.03, zc + 0.6), paint2 if big else m['trim'])
    for i in range(5 if big else 4):
        mb.box((W * 0.6, 0.07, 0.04), (0, cab_y0 - 0.04, zc + 0.3 + i * 0.15), m['trim'])
    mb.box((W + 0.08, 0.25, 0.32), (0, cab_y0 - 0.1, zc + 0.05), m['chrome'] if big else m['trim'], bevel=0.06)
    lights_front(mb, m, W, cab_y0 - 0.04, zc + 0.48, size=(0.34, 0.06, 0.2))
    # roof
    if big:
        mb.box((W - 0.2, cabL * 0.7, 0.45), (0, cab_y0 + cabL * 0.55, cabH + 0.2), paint, bevel=0.15, taper=(0.95, 0.8))
        mb.box((W * 0.8, 0.14, 0.12), (0, cab_y0 + 0.1, cabH + 0.08), m['amber'], bevel=0.03)
        for x in (W / 2 + 0.08, -W / 2 - 0.08):
            mb.cyl(0.09, 2.4, (x, cab_y1 + 0.05, cabH - 0.1), m['chrome'], verts=10)   # stacks
            mb.box((0.06, bedL * 0.7, 0.4), (x * 0.98, cab_y1 + bedL * 0.45, r + 0.45), paint2)  # skirts
    else:
        mb.box((W * 0.7, 0.14, 0.1), (0, cab_y0 + 0.2, cabH + 0.05), m['amber'], bevel=0.03)
        mb.cyl(0.07, 1.6, (-W / 2 - 0.06, cab_y1 - 0.15, cabH - 0.4), m['chrome'], verts=10)
    # mirrors
    for x in (W / 2 + 0.2, -W / 2 - 0.2):
        mb.box((0.06, 0.14, 0.38), (x, cab_y0 + 0.25, cabH - 0.9), m['trim'], bevel=0.02)
    # flatbed
    by0 = cab_y1 + 0.2
    by1 = by0 + bedL
    mb.box((W, bedL, 0.16), (0, (by0 + by1) / 2, bedZ), paint2, bevel=0.03)
    for x in (W / 2 - 0.04, -W / 2 + 0.04):
        mb.box((0.08, bedL, 0.32), (x, (by0 + by1) / 2, bedZ + 0.24), paint)
        for i in range(int(bedL / 1.2) + 1):
            mb.box((0.1, 0.1, 0.42), (x, by0 + 0.05 + i * (bedL - 0.1) / int(bedL / 1.2), bedZ + 0.29), m['trim'])
    mb.box((W, 0.1, 0.9), (0, by0 + 0.05, bedZ + 0.5), m['trim'])          # headboard
    mb.box((W, 0.08, 0.36), (0, by1 - 0.04, bedZ + 0.26), paint)            # tailgate
    lights_rear(mb, m, W, by1 + 0.02, bedZ - 0.15, size=(0.3, 0.06, 0.14))
    mb.box((W + 0.02, 0.15, 0.2), (0, by1 + 0.05, bedZ - 0.38), m['trim'])
    # fenders over rear wheels
    for y in axles[1:]:
        for x in (W / 2 - 0.15, -W / 2 + 0.15):
            mb.box((tw + 0.12, r * 2.3, 0.06), (x, y, r * 2 + 0.12), m['trim'])
    mb.finish("body", parent=root)
    names = ("F", "M", "R") if big else ("F", "R")
    four_wheels(root, m, r, tw, W - tw, axles, names)
    empty("seat", (W / 2 - 0.6, cab_y0 + cabL * 0.4, zc + 0.85), root)
    empty("headlamp", (0, cab_y0 - 0.1, zc + 0.48), root)
    empty("exhaust", ((W / 2 + 0.08) if big else (-W / 2 - 0.06), cab_y1 + 0.05, cabH + (1.1 if big else 0.4)), root)
    cargo_empty(root, (0, (by0 + by1) / 2 + 0.05, bedZ + 0.08), W - 0.3, bedL - 0.3, 2.0)
    return finish_vehicle(root, kind)

# ------------------------------------------------------------------ traffic / parked cars

def car(kind):
    clear_scene()
    m = M()
    root = empty("car_" + kind)
    paint = mat("paint", hexc("#4361ee"), rough=0.3, metal=0.25)
    if kind == "sedan":
        L, W, r, tw, wb = 4.4, 1.8, 0.34, 0.24, 2.65
    elif kind == "hatch":
        L, W, r, tw, wb = 3.7, 1.72, 0.32, 0.22, 2.35
    elif kind == "pickup":
        L, W, r, tw, wb = 4.9, 1.9, 0.4, 0.27, 3.0
    else:  # taxi uses the sedan body
        L, W, r, tw, wb = 4.4, 1.8, 0.34, 0.24, 2.65
    fy, ry = -wb / 2, wb / 2
    mb = MB()
    zl = 0.3
    # lower body
    mb.box((W, L, 0.62), (0, 0, zl + 0.31), paint, bevel=0.14)
    # cabin
    if kind in ("sedan", "taxi"):
        cy0, cy1, ch = -0.75, 0.95, 0.62
    elif kind == "hatch":
        cy0, cy1, ch = -0.55, 1.6, 0.66
    else:
        cy0, cy1, ch = -0.95, 0.5, 0.72
    mb.box((W - 0.12, cy1 - cy0, ch), (0, (cy0 + cy1) / 2, zl + 0.62 + ch / 2), paint, bevel=0.12, taper=(0.92, 0.78))
    # windows
    mb.box((W - 0.26, 0.05, ch * 0.78), (0, cy0 + 0.11, zl + 0.62 + ch * 0.47), m['glass'], rot=(-38, 0, 0))
    mb.box((W - 0.26, 0.05, ch * 0.72), (0, cy1 - 0.12, zl + 0.62 + ch * 0.45), m['glass'], rot=(34, 0, 0))
    for x in (W / 2 - 0.08, -W / 2 + 0.08):
        mb.box((0.03, (cy1 - cy0) * 0.7, ch * 0.62), (x * 0.985, (cy0 + cy1) / 2, zl + 0.62 + ch * 0.46), m['glass'])
    if kind == "pickup":
        by0, by1 = cy1 + 0.08, L / 2 - 0.08
        mb.box((W - 0.1, by1 - by0, 0.1), (0, (by0 + by1) / 2, zl + 0.64), m['trim'])
    if kind == "taxi":
        sign = mat("taxi_sign", hexc("#fff7cc"), emit=hexc("#ffe680"), emit_strength=0.6)
        mb.box((0.5, 0.22, 0.16), (0, (cy0 + cy1) / 2, zl + 0.62 + ch + 0.08), sign, bevel=0.04)
        chk = mat("paint2", hexc("#1b1d22"), rough=0.5)
        for x in (W / 2 + 0.005, -W / 2 - 0.005):
            mb.box((0.02, L * 0.6, 0.08), (x, 0, zl + 0.45), chk)
    # bumpers and lights
    mb.box((W + 0.02, 0.14, 0.2), (0, -L / 2, zl + 0.12), m['trim'], bevel=0.05)
    mb.box((W + 0.02, 0.14, 0.2), (0, L / 2, zl + 0.12), m['trim'], bevel=0.05)
    lights_front(mb, m, W, -L / 2 + 0.02, zl + 0.42, size=(0.34, 0.06, 0.14))
    lights_rear(mb, m, W, L / 2 - 0.01, zl + 0.45, size=(0.3, 0.06, 0.12))
    for y in (fy, ry):
        for x in (W / 2 + 0.005, -W / 2 - 0.005):
            mb.box((0.03, r * 2.3, r * 1.1), (x, y, r + 0.05), m['trim'], bevel=0.02)
    mb.finish("body", parent=root)
    four_wheels(root, m, r, tw, W - tw - 0.06, (fy, ry), ("F", "R"))
    empty("headlamp", (0, -L / 2 - 0.05, zl + 0.42), root)
    empty("exhaust", (-W / 2 + 0.3, L / 2 + 0.05, 0.25), root)
    empty("seat", (W / 2 - 0.5, -0.1, zl + 0.75), root)
    return finish_vehicle(root, "car_" + kind)


def airplane():
    clear_scene()
    m = M()
    root = empty("airplane")
    white = mat("paint", hexc("#f4f6f8"), rough=0.35, metal=0.1)
    blue = mat("paint2", hexc("#ff7a1f"), rough=0.4)
    eng = mat("trim", hexc("#9aa3ad"), rough=0.3, metal=0.7)
    mb = MB()
    mb.cyl(2.2, 30, (0, 0, 4.0), white, axis='Y', verts=16)
    mb.cyl(2.2, 4, (0, -17, 4.0), white, axis='Y', verts=16, r2=0.6)
    mb.cyl(2.2, 6, (0, 18, 4.6), white, axis='Y', verts=16, r2=0.5, rot=(4, 0, 0))
    mb.box((34, 6, 0.5), (0, 1, 3.0), white, bevel=0.15, taper=(1, 1))
    mb.box((12, 3, 0.35), (0, 19.5, 5.2), white, bevel=0.1)
    mb.box((0.5, 4, 7), (0, 19.5, 8.0), blue, bevel=0.15, taper=(1, 0.6))
    mb.box((4.42, 26, 0.6), (0, 0, 3.0), blue)
    for x in (8, -8):
        mb.cyl(1.2, 4.2, (x, -1.5, 1.9), eng, axis='Y', verts=14)
        mb.box((0.4, 2, 1.0), (x, 0, 2.6), white)
    mb.box((3.6, 0.3, 0.9), (0, -17.8, 5.0), m['glass'], rot=(-30, 0, 0))
    for i in range(14):
        for x in (2.19, -2.19):
            mb.box((0.05, 0.5, 0.45), (x, -12 + i * 1.8, 4.6), m['glass'])
    for y, xs in ((-12, (0,)), (2, (2.5, -2.5))):
        for x in xs:
            mb.cyl(0.12, 1.6, (x, y, 1.0), eng, verts=6)
            mb.cyl(0.55, 0.45, (x, y, 0.55), m['tire'], axis='X', verts=12)
    mb.finish("body", parent=root)
    return export_glb(root, "models/vehicles/airplane.glb"), tri_count(root)
