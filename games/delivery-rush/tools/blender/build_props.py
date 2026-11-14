# DELIVERY RUSH - props: package box, street furniture, trees, signs, traffic lights.
# exec(open(r"...\dr_lib.py").read()); exec(open(r"...\build_props.py").read())
import math

def build_package():
    clear_scene()
    root = empty("package")
    box = mat("box", hexc("#b07a45"), rough=0.85)
    tape = mat("tape", hexc("#d9b07a"), rough=0.5)
    label = mat("label", hexc("#f4f1ea"), rough=0.7)
    ink = mat("ink", hexc("#2b2b2b"), rough=0.7)
    mb = MB()
    s = 0.5
    mb.box((s, s, s), (0, 0, s / 2), box, bevel=0.025)
    mb.box((0.1, s + 0.006, s + 0.006), (0, 0, s / 2), tape)          # tape over top + front/back
    mb.box((0.25, 0.006, 0.16), (0.1, -s / 2 - 0.002, s * 0.62), label)  # label on the front
    mb.box((0.16, 0.008, 0.02), (0.1, -s / 2 - 0.004, s * 0.67), ink)
    mb.box((0.12, 0.008, 0.02), (0.08, -s / 2 - 0.004, s * 0.6), ink)
    mb.finish("package_box", parent=root)
    return export_glb(root, "models/props/package.glb"), tri_count(root)


def build_streetlight():
    clear_scene()
    root = empty("streetlight")
    pole = mat("pole", hexc("#3b4250"), rough=0.4, metal=0.6)
    lamp = mat("lamp", hexc("#fff2c4"), emit=hexc("#ffe7a0"), emit_strength=0.0)
    mb = MB()
    mb.cyl(0.18, 0.35, (0, 0, 0.175), pole, verts=10)
    mb.cyl(0.08, 6.4, (0, 0, 3.4), pole, verts=8)
    mb.box((0.14, 1.6, 0.12), (0, -0.75, 6.5), pole, bevel=0.03)   # arm out over the road (-Y = forward)
    mb.box((0.5, 0.7, 0.18), (0, -1.45, 6.42), pole, bevel=0.04)
    mb.finish("streetlight_pole", parent=root)
    mb = MB()
    mb.box((0.4, 0.6, 0.06), (0, -1.45, 6.31), lamp)
    mb.finish("streetlight_lamp", parent=root)
    return export_glb(root, "models/props/streetlight.glb"), tri_count(root)


def build_trafficlight():
    clear_scene()
    root = empty("trafficlight")
    pole = mat("pole", hexc("#3b4250"), rough=0.4, metal=0.6)
    housing = mat("housing", hexc("#22252b"), rough=0.5)
    # pole at the corner, arm reaching over the lane along -X, lenses facing -Y (front)
    ARM = 4.8
    mb = MB()
    mb.cyl(0.16, 0.3, (0, 0, 0.15), pole, verts=10)
    mb.cyl(0.08, 5.6, (0, 0, 2.9), pole, verts=8)
    mb.box((ARM + 0.2, 0.12, 0.12), (-ARM / 2, 0, 5.5), pole, bevel=0.03)
    mb.box((0.42, 0.45, 1.25), (-ARM, 0, 4.95), housing, bevel=0.06)   # head over the lane
    mb.box((0.34, 0.36, 0.9), (0, 0.0, 2.6), housing, bevel=0.05)       # small head on the pole
    for z in (5.33, 4.95, 4.57):
        mb.box((0.36, 0.1, 0.04), (-ARM, -0.24, z + 0.17), housing)     # visors
    mb.finish("trafficlight_pole", parent=root)
    # lamps as separate parts so the game can colour them per phase
    for name, col, z in (("tl_red", "#ff3b30", 5.33), ("tl_amber", "#ffb300", 4.95), ("tl_green", "#2ee66b", 4.57)):
        m = mat(name, hexc(col), emit=hexc(col), emit_strength=0.0)
        mb = MB()
        mb.cyl(0.13, 0.06, (-ARM, -0.215, z), m, axis='Y', verts=12, smooth=False)
        small_z = 2.6 + (z - 4.95) * (0.25 / 0.38)          # matching lamp on the small head
        mb.cyl(0.09, 0.06, (0, -0.19, small_z), m, axis='Y', verts=10, smooth=False)
        mb.finish(name, parent=root)
    return export_glb(root, "models/props/trafficlight.glb"), tri_count(root)


def build_tree(kind):
    clear_scene()
    root = empty("tree_" + kind)
    bark = mat("bark", hexc("#7a5234"), rough=0.9)
    if kind == "round":
        leaf = mat("leaves", hexc("#4caf50"), rough=0.8)
        mb = MB()
        mb.cyl(0.22, 2.4, (0, 0, 1.2), bark, verts=8, r2=0.16)
        mb.finish("tree_trunk", parent=root)
        mb = MB()
        mb.box((2.6, 2.6, 2.2), (0, 0, 3.4), leaf, bevel=0.35)
        mb.box((1.9, 1.9, 1.6), (0.3, -0.2, 4.6), leaf, bevel=0.3, rot=(0, 0, 20))
        mb.box((1.4, 1.4, 1.2), (-0.6, 0.5, 2.6), leaf, bevel=0.25, rot=(0, 0, 40))
        mb.finish("tree_leaves", parent=root)
    elif kind == "pine":
        leaf = mat("leaves", hexc("#2e8b57"), rough=0.8)
        mb = MB()
        mb.cyl(0.2, 1.6, (0, 0, 0.8), bark, verts=8)
        mb.finish("tree_trunk", parent=root)
        mb = MB()
        for i, (r, z) in enumerate(((1.7, 2.1), (1.35, 3.3), (0.95, 4.4), (0.5, 5.3))):
            mb.cyl(r, 1.5 - i * 0.15, (0, 0, z), leaf, verts=8, r2=r * 0.35, smooth=False)
        mb.finish("tree_leaves", parent=root)
    elif kind == "palm":
        leaf = mat("leaves", hexc("#5cbf3a"), rough=0.8)
        mb = MB()
        for i in range(6):
            mb.cyl(0.2 - i * 0.015, 0.9, (math.sin(i * 0.35) * 0.25, 0, 0.45 + i * 0.88), bark,
                   verts=7, rot=(0, 4 * math.cos(i), 0))
        mb.finish("tree_trunk", parent=root)
        mb = MB()
        top = (math.sin(5 * 0.35) * 0.25, 0, 5.45)
        for i in range(7):
            a = i / 7 * math.tau
            loc = (top[0] - math.sin(a) * 1.05, math.cos(a) * 1.05, top[2] - 0.25)
            mb.box((0.55, 2.3, 0.08), loc, leaf, rot=(-22, 0, math.degrees(a)))
        mb.box((0.5, 0.5, 0.4), (top[0], 0, top[2]), leaf, bevel=0.1)
        mb.finish("tree_leaves", parent=root)
    elif kind == "bush":
        leaf = mat("leaves", hexc("#3f9e48"), rough=0.85)
        mb = MB()
        mb.box((1.3, 1.3, 0.9), (0, 0, 0.45), leaf, bevel=0.25)
        mb.box((0.9, 0.9, 0.6), (0.35, 0.2, 0.9), leaf, bevel=0.2, rot=(0, 0, 25))
        mb.finish("tree_leaves", parent=root)
    return export_glb(root, "models/props/tree_%s.glb" % kind), tri_count(root)


def build_bench():
    clear_scene()
    root = empty("bench")
    wood = mat("wood", hexc("#c98a4b"), rough=0.8)
    iron = mat("iron", hexc("#2f3540"), rough=0.4, metal=0.6)
    mb = MB()
    for x in (-0.75, 0.75):
        mb.box((0.08, 0.5, 0.45), (x, 0, 0.225), iron)
        mb.box((0.08, 0.08, 0.5), (x, 0.22, 0.65), iron)
    mb.finish("bench_frame", parent=root)
    mb = MB()
    for i, y in enumerate((-0.16, 0.0, 0.16)):
        mb.box((1.8, 0.13, 0.05), (0, y, 0.47), wood, bevel=0.015)
    for z in (0.66, 0.82):
        mb.box((1.8, 0.05, 0.12), (0, 0.24, z), wood, bevel=0.015)
    mb.finish("bench_wood", parent=root)
    return export_glb(root, "models/props/bench.glb"), tri_count(root)


def build_small_props():
    out = []
    # bin
    clear_scene()
    root = empty("bin")
    green = mat("bin_body", hexc("#2e9d5b"), rough=0.6)
    lid = mat("bin_lid", hexc("#24784a"), rough=0.6)
    mb = MB()
    mb.cyl(0.32, 0.9, (0, 0, 0.45), green, verts=12, r2=0.36)
    mb.cyl(0.38, 0.08, (0, 0, 0.94), lid, verts=12)
    mb.finish("bin_body", parent=root)
    out.append(export_glb(root, "models/props/bin.glb"))
    # hydrant
    clear_scene()
    root = empty("hydrant")
    red = mat("hydrant", hexc("#e53935"), rough=0.45)
    cap = mat("hydrant_cap", hexc("#f2f2f2"), rough=0.5)
    mb = MB()
    mb.cyl(0.18, 0.12, (0, 0, 0.06), red, verts=10)
    mb.cyl(0.13, 0.55, (0, 0, 0.38), red, verts=10)
    mb.cyl(0.16, 0.08, (0, 0, 0.66), red, verts=10)
    mb.sphere(0.13, (0, 0, 0.72), cap, seg=10, rings=5)
    mb.cyl(0.06, 0.4, (0, 0, 0.45), cap, axis='X', verts=8)
    mb.finish("hydrant_body", parent=root)
    out.append(export_glb(root, "models/props/hydrant.glb"))
    # mailbox
    clear_scene()
    root = empty("mailbox")
    post = mat("wood", hexc("#8b5e3c"), rough=0.8)
    box = mat("mailbox", hexc("#3a6fd8"), rough=0.4, metal=0.3)
    flag = mat("flag", hexc("#e53935"), rough=0.5)
    mb = MB()
    mb.box((0.1, 0.1, 1.0), (0, 0, 0.5), post)
    mb.box((0.3, 0.5, 0.28), (0, 0, 1.12), box, bevel=0.05)
    mb.box((0.03, 0.05, 0.25), (0.17, 0.12, 1.25), flag)
    mb.finish("mailbox_body", parent=root)
    out.append(export_glb(root, "models/props/mailbox.glb"))
    # cone
    clear_scene()
    root = empty("cone")
    org = mat("cone", hexc("#ff7a1a"), rough=0.5)
    wht = mat("cone_band", hexc("#f4f4f4"), rough=0.5)
    mb = MB()
    mb.box((0.45, 0.45, 0.05), (0, 0, 0.025), org)
    mb.cyl(0.18, 0.62, (0, 0, 0.36), org, verts=10, r2=0.05, smooth=False)
    mb.cyl(0.135, 0.1, (0, 0, 0.36), wht, verts=10, r2=0.118, smooth=False)
    mb.finish("cone_body", parent=root)
    out.append(export_glb(root, "models/props/cone.glb"))
    # container (shipping)
    clear_scene()
    root = empty("container")
    steel = mat("paint", hexc("#d84a3a"), rough=0.6, metal=0.2)
    dark = mat("container_dark", hexc("#4a4f57"), rough=0.6, metal=0.3)
    mb = MB()
    L, W, H = 6.1, 2.45, 2.6
    mb.box((W, L, H), (0, 0, H / 2), steel, bevel=0.03)
    for i in range(13):
        y = -L / 2 + 0.3 + i * (L - 0.6) / 12
        for x in (-W / 2, W / 2):
            mb.box((0.06, 0.18, H * 0.92), (x, y, H / 2), steel)
    for z in (0.08, H - 0.08):
        for x in (-W / 2, W / 2):
            mb.box((0.12, L + 0.02, 0.16), (x, 0, z), dark)
    mb.box((W * 0.96, 0.05, H * 0.92), (0, -L / 2 - 0.02, H / 2), dark)
    mb.finish("container_body", parent=root)
    out.append(export_glb(root, "models/props/container.glb"))
    # pallet with crates
    clear_scene()
    root = empty("crates")
    wood = mat("wood", hexc("#c4955a"), rough=0.85)
    mb = MB()
    mb.box((1.2, 1.0, 0.14), (0, 0, 0.07), wood)
    mb.box((0.55, 0.95, 0.55), (-0.3, 0, 0.42), wood, bevel=0.03)
    mb.box((0.55, 0.45, 0.55), (0.3, -0.25, 0.42), wood, bevel=0.03)
    mb.box((0.5, 0.45, 0.45), (0.3, 0.25, 0.37), wood, bevel=0.03)
    mb.finish("crates_body", parent=root)
    out.append(export_glb(root, "models/props/crates.glb"))
    # sign post (street name / direction sign): plate material 'sign' gets a texture in game
    clear_scene()
    root = empty("signpost")
    pole = mat("pole", hexc("#3b4250"), rough=0.4, metal=0.6)
    plate = mat("sign", hexc("#1f7a4d"), rough=0.5)
    mb = MB()
    mb.cyl(0.06, 3.0, (0, 0, 1.5), pole, verts=8)
    mb.box((1.4, 0.05, 0.36), (0.6, 0, 2.8), plate, bevel=0.03)
    mb.box((0.05, 1.4, 0.36), (0, 0.6, 2.4), plate, bevel=0.03)
    mb.finish("signpost_body", parent=root)
    out.append(export_glb(root, "models/props/signpost.glb"))
    # job board kiosk (the place where players take jobs)
    clear_scene()
    root = empty("jobboard")
    frame = mat("paint", hexc("#ff8a1f"), rough=0.5)
    board = mat("board", hexc("#24324a"), rough=0.6)
    screen = mat("screen", hexc("#4fd1ff"), emit=hexc("#4fd1ff"), emit_strength=1.5)
    mb = MB()
    mb.box((2.6, 0.6, 0.3), (0, 0, 0.15), board, bevel=0.06)
    for x in (-1.15, 1.15):
        mb.box((0.22, 0.22, 2.6), (x, 0, 1.6), frame, bevel=0.05)
    mb.box((2.6, 0.3, 1.6), (0, 0, 2.0), board, bevel=0.08)
    mb.box((2.8, 0.8, 0.22), (0, 0, 3.0), frame, bevel=0.08)
    mb.finish("jobboard_body", parent=root)
    mb = MB()
    mb.box((2.2, 0.04, 1.25), (0, -0.16, 2.0), screen)
    mb.finish("jobboard_screen", parent=root)
    out.append(export_glb(root, "models/props/jobboard.glb"))
    # fence segment (2 m)
    clear_scene()
    root = empty("fence")
    white = mat("fence", hexc("#f3efe6"), rough=0.7)
    mb = MB()
    for i in range(5):
        mb.box((0.1, 0.06, 0.9), (-0.8 + i * 0.4, 0, 0.45), white, taper=(1, 1))
    for z in (0.3, 0.7):
        mb.box((2.0, 0.05, 0.08), (0, 0.04, z), white)
    mb.finish("fence_body", parent=root)
    out.append(export_glb(root, "models/props/fence.glb"))
    # chain-link / industrial fence segment (4 m)
    clear_scene()
    root = empty("fence_metal")
    pole = mat("pole", hexc("#8a9099"), rough=0.4, metal=0.7)
    mesh = mat("chainlink", hexc("#a9b0b8"), rough=0.5, metal=0.5, alpha=0.55)
    mb = MB()
    for x in (-2, 2):
        mb.cyl(0.05, 2.2, (x, 0, 1.1), pole, verts=6)
    mb.cyl(0.03, 4.0, (0, 0, 2.15), pole, axis='X', verts=6)
    mb.finish("fence_metal_poles", parent=root)
    mb = MB()
    mb.box((4.0, 0.02, 2.0), (0, 0, 1.1), mesh)
    mb.finish("fence_metal_mesh", parent=root)
    out.append(export_glb(root, "models/props/fence_metal.glb"))
    # parasol table (restaurants)
    clear_scene()
    root = empty("cafe_table")
    top = mat("table", hexc("#f4f1ea"), rough=0.6)
    leg = mat("iron", hexc("#2f3540"), rough=0.4, metal=0.6)
    umb = mat("paint", hexc("#e94f4f"), rough=0.6)
    mb = MB()
    mb.cyl(0.45, 0.05, (0, 0, 0.75), top, verts=12)
    mb.cyl(0.04, 2.3, (0, 0, 1.15), leg, verts=6)
    mb.cyl(0.25, 0.04, (0, 0, 0.02), leg, verts=10)
    for x in (-0.65, 0.65):
        mb.box((0.38, 0.38, 0.05), (x, 0, 0.45), top)
        mb.box((0.38, 0.05, 0.45), (x + (0.17 if x > 0 else -0.17), 0, 0.68), top, rot=(0, 0, 90))
        mb.cyl(0.03, 0.45, (x, 0, 0.22), leg, verts=6)
    mb.finish("cafe_table_base", parent=root)
    mb = MB()
    mb.cyl(1.35, 0.5, (0, 0, 2.2), umb, verts=8, r2=0.05, smooth=False)
    mb.finish("cafe_table_umbrella", parent=root)
    out.append(export_glb(root, "models/props/cafe_table.glb"))
    return out
