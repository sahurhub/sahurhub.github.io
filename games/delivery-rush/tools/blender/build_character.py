# DELIVERY RUSH - blocky rigged courier character + animation clips + cosmetic accessories.
# Needs dr_lib.py executed first.
import math, bmesh
from mathutils import Vector, Matrix

BONES = {
    # name: (head, tail, parent)
    "root":  ((0, 0, 0), (0, 0, 0.3), None),
    "hips":  ((0, 0, 0.72), (0, 0, 0.9), "root"),
    "torso": ((0, 0, 0.72), (0, 0, 1.38), "hips"),
    "head":  ((0, 0, 1.38), (0, 0, 1.82), "torso"),
    "arm_L": ((0.53, 0, 1.30), (0.53, 0, 0.72), "torso"),
    "arm_R": ((-0.53, 0, 1.30), (-0.53, 0, 0.72), "torso"),
    "leg_L": ((0.17, 0, 0.72), (0.17, 0, 0.0), "hips"),
    "leg_R": ((-0.17, 0, 0.72), (-0.17, 0, 0.0), "hips"),
}


class SkinMB(MB):
    """MB that also records which bone each primitive belongs to."""

    def __init__(self):
        super().__init__()
        self.groups = []
        self.dl = self.bm.verts.layers.deform.verify()
        self._cur = None

    def part(self, bone):
        self._cur = bone
        if bone not in self.groups:
            self.groups.append(bone)
        return self

    def _assign_new(self, start):
        self.bm.verts.ensure_lookup_table()
        gi = self.groups.index(self._cur)
        dl = self.bm.verts.layers.deform.verify()
        for i in range(start, len(self.bm.verts)):
            self.bm.verts[i][dl][gi] = 1.0

    def box(self, *a, **k):
        s = len(self.bm.verts); super().box(*a, **k); self._assign_new(s); return self

    def cyl(self, *a, **k):
        s = len(self.bm.verts); super().cyl(*a, **k); self._assign_new(s); return self

    def sphere(self, *a, **k):
        s = len(self.bm.verts); super().sphere(*a, **k); self._assign_new(s); return self

    def finish_skin(self, name):
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        work_scene().collection.objects.link(ob)
        for g in self.groups:
            ob.vertex_groups.new(name=g)
        return ob


def make_armature(name="Rig"):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    work_scene().collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for n, (h, t, p) in BONES.items():
        b = arm.edit_bones.new(n)
        b.head = Vector(h); b.tail = Vector(t); b.roll = 0.0
        eb[n] = b
    for n, (h, t, p) in BONES.items():
        if p:
            eb[n].parent = eb[p]
            eb[n].use_connect = False
    for n in ("leg_L", "leg_R", "arm_L", "arm_R", "head", "torso", "hips"):
        arm.edit_bones[n].use_deform = True
    arm.edit_bones["root"].use_deform = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'XYZ'
    return ob


def build_body(rig):
    skin = mat("skin", hexc("#f2c79b"), rough=0.6)
    shirt = mat("shirt", hexc("#ff7a1f"), rough=0.7)      # courier orange (recoloured by cosmetics)
    shirt2 = mat("shirt_trim", hexc("#ffffff"), rough=0.7)
    pants = mat("pants", hexc("#2f3f5c"), rough=0.75)
    shoes = mat("shoes", hexc("#262a33"), rough=0.6)
    hair = mat("hair", hexc("#4a3020"), rough=0.8)
    eye = mat("eyes", hexc("#1b1d22"), rough=0.3)
    white = mat("eye_white", hexc("#ffffff"), rough=0.3)
    belt = mat("belt", hexc("#3a2c22"), rough=0.6)
    mouth = mat("mouth", hexc("#7a3b2e"), rough=0.6)

    mb = SkinMB()
    # legs
    for side, x in (("L", 0.17), ("R", -0.17)):
        mb.part("leg_" + side)
        mb.box((0.31, 0.34, 0.62), (x, 0, 0.42), pants, bevel=0.03)
        mb.box((0.33, 0.42, 0.14), (x, -0.035, 0.07), shoes, bevel=0.04)
    # torso
    mb.part("torso")
    mb.box((0.74, 0.38, 0.6), (0, 0, 1.06), shirt, bevel=0.05)
    mb.box((0.76, 0.40, 0.08), (0, 0, 0.77), belt, bevel=0.02)
    mb.box((0.3, 0.02, 0.12), (0.16, -0.2, 1.18), shirt2)      # chest badge
    mb.box((0.76, 0.40, 0.04), (0, 0, 1.33), shirt2)           # collar trim
    # arms
    for side, x in (("L", 0.53), ("R", -0.53)):
        mb.part("arm_" + side)
        mb.box((0.29, 0.32, 0.32), (x, 0, 1.15), shirt, bevel=0.04)
        mb.box((0.26, 0.29, 0.3), (x, 0, 0.84), skin, bevel=0.04)
    # head
    mb.part("head")
    mb.box((0.2, 0.2, 0.08), (0, 0, 1.40), skin)
    mb.box((0.52, 0.48, 0.46), (0, 0, 1.64), skin, bevel=0.08)
    mb.box((0.56, 0.52, 0.12), (0, 0.01, 1.87), hair, bevel=0.04)
    mb.box((0.56, 0.16, 0.3), (0, 0.19, 1.72), hair, bevel=0.04)
    for x in (0.11, -0.11):
        mb.box((0.075, 0.03, 0.11), (x, -0.245, 1.67), eye, bevel=0.01)
        mb.box((0.025, 0.035, 0.03), (x + 0.015, -0.25, 1.70), white)
        mb.box((0.11, 0.03, 0.025), (x, -0.245, 1.76), hair)   # brows
    mb.box((0.16, 0.03, 0.035), (0, -0.245, 1.52), mouth)
    mb.box((0.035, 0.03, 0.05), (0.08, -0.245, 1.54), mouth)
    mb.box((0.035, 0.03, 0.05), (-0.08, -0.245, 1.54), mouth)
    body = mb.finish_skin("courier_body")
    body.parent = rig
    mod = body.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    return body

# ---------------------------------------------------------------- animation

def _signs(rig):
    """For each bone: rotation signs so that 'swing' moves the tip forward (-Y) and
    'side' moves it away from the body centre line."""
    out = {}
    for b in rig.data.bones:
        m = b.matrix_local.to_3x3()
        X = m.col[0]; Z = m.col[2]
        fwd = Vector((0, -1, 0))
        sw = 1 if Z.dot(fwd) > 0 else -1
        outward = Vector((1 if b.head_local.x >= 0 else -1, 0, 0))
        sd = 1 if (-X).dot(outward) > 0 else -1
        out[b.name] = (sw, sd)
    return out


def make_action(rig, name, keys, length, loop=True):
    """keys: {frame: {bone: (swing, side, twist) in degrees, '_bob': metres}}"""
    sg = _signs(rig)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    used = set()
    for fr in sorted(keys):
        for bn, v in keys[fr].items():
            if bn == "_bob":
                continue
            used.add(bn)
    for fr in sorted(keys):
        k = keys[fr]
        for bn in used:
            pb = rig.pose.bones[bn]
            sw, sd = sg[bn]
            s, d, t = k.get(bn, (0, 0, 0))
            pb.rotation_euler = (math.radians(s) * sw, math.radians(t), math.radians(d) * sd)
            pb.keyframe_insert("rotation_euler", frame=fr)
        hb = rig.pose.bones["hips"]
        hb.location = (0, k.get("_bob", 0.0), 0)    # hips local Y = world up
        hb.keyframe_insert("location", frame=fr)
    act.use_fake_user = True
    try:
        act.use_frame_range = True
        act.frame_start = 0
        act.frame_end = length
        act.use_cyclic = loop
    except Exception:
        pass
    # push to an NLA track so the exporter keeps every clip
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 0, act)
    rig.animation_data.action = None
    return act


def build_actions(rig):
    A = {}
    # idle (2 s)
    A["idle"] = ({0: {"torso": (0, 0, 0), "arm_L": (0, 4, 0), "arm_R": (0, 4, 0), "head": (0, 0, 0), "_bob": 0},
                  30: {"torso": (2, 0, 0), "arm_L": (2, 7, 0), "arm_R": (2, 7, 0), "head": (-2, 0, 3), "_bob": -0.012},
                  60: {"torso": (0, 0, 0), "arm_L": (0, 4, 0), "arm_R": (0, 4, 0), "head": (0, 0, 0), "_bob": 0}}, 60)
    # walk (1 s)
    def walk(L, A_, lean, bob, n):
        h = n // 2; q = n // 4
        return {0: {"leg_L": (L, 0, 0), "leg_R": (-L, 0, 0), "arm_L": (-A_, 4, 0), "arm_R": (A_, 4, 0), "torso": (lean, 0, 0), "_bob": 0},
                q: {"leg_L": (0, 0, 0), "leg_R": (0, 0, 0), "arm_L": (0, 4, 0), "arm_R": (0, 4, 0), "torso": (lean, 0, 0), "_bob": bob},
                h: {"leg_L": (-L, 0, 0), "leg_R": (L, 0, 0), "arm_L": (A_, 4, 0), "arm_R": (-A_, 4, 0), "torso": (lean, 0, 0), "_bob": 0},
                h + q: {"leg_L": (0, 0, 0), "leg_R": (0, 0, 0), "arm_L": (0, 4, 0), "arm_R": (0, 4, 0), "torso": (lean, 0, 0), "_bob": bob},
                n: {"leg_L": (L, 0, 0), "leg_R": (-L, 0, 0), "arm_L": (-A_, 4, 0), "arm_R": (A_, 4, 0), "torso": (lean, 0, 0), "_bob": 0}}
    A["walk"] = (walk(32, 28, 3, 0.045, 32), 32)
    A["run"] = (walk(58, 62, 12, 0.08, 20), 20)
    # jump / fall (held pose)
    A["jump"] = ({0: {"arm_L": (10, 60, 0), "arm_R": (10, 60, 0), "leg_L": (25, 0, 0), "leg_R": (-12, 0, 0), "torso": (-4, 0, 0)},
                  10: {"arm_L": (20, 150, 0), "arm_R": (20, 150, 0), "leg_L": (35, 0, 0), "leg_R": (-18, 0, 0), "torso": (-6, 0, 0)},
                  20: {"arm_L": (20, 145, 0), "arm_R": (20, 145, 0), "leg_L": (30, 0, 0), "leg_R": (-15, 0, 0), "torso": (-5, 0, 0)}}, 20)
    # drive (seated in a van / truck cab), slight steering motion
    A["drive"] = ({0: {"leg_L": (88, 6, 0), "leg_R": (88, 6, 0), "arm_L": (68, 6, 0), "arm_R": (64, 6, 0), "torso": (-4, 0, 0), "head": (2, 0, 0)},
                   45: {"leg_L": (88, 6, 0), "leg_R": (88, 6, 0), "arm_L": (64, 6, 0), "arm_R": (68, 6, 0), "torso": (-4, 0, 0), "head": (2, 0, -3)},
                   90: {"leg_L": (88, 6, 0), "leg_R": (88, 6, 0), "arm_L": (68, 6, 0), "arm_R": (64, 6, 0), "torso": (-4, 0, 0), "head": (2, 0, 0)}}, 90)
    # ride (pedal bikes): legs pedal, lean forward
    A["ride"] = ({0: {"leg_L": (80, 4, 0), "leg_R": (30, 4, 0), "arm_L": (72, 8, 0), "arm_R": (72, 8, 0), "torso": (24, 0, 0), "head": (-18, 0, 0)},
                  6: {"leg_L": (55, 4, 0), "leg_R": (55, 4, 0), "arm_L": (72, 8, 0), "arm_R": (72, 8, 0), "torso": (24, 0, 0), "head": (-18, 0, 0)},
                  12: {"leg_L": (30, 4, 0), "leg_R": (80, 4, 0), "arm_L": (72, 8, 0), "arm_R": (72, 8, 0), "torso": (24, 0, 0), "head": (-18, 0, 0)},
                  18: {"leg_L": (55, 4, 0), "leg_R": (55, 4, 0), "arm_L": (72, 8, 0), "arm_R": (72, 8, 0), "torso": (24, 0, 0), "head": (-18, 0, 0)},
                  24: {"leg_L": (80, 4, 0), "leg_R": (30, 4, 0), "arm_L": (72, 8, 0), "arm_R": (72, 8, 0), "torso": (24, 0, 0), "head": (-18, 0, 0)}}, 24)
    # moto (moped / motorbike): seated astride
    A["moto"] = ({0: {"leg_L": (62, 14, 0), "leg_R": (62, 14, 0), "arm_L": (70, 12, 0), "arm_R": (70, 12, 0), "torso": (18, 0, 0), "head": (-12, 0, 0)},
                  40: {"leg_L": (62, 14, 0), "leg_R": (62, 14, 0), "arm_L": (72, 12, 0), "arm_R": (72, 12, 0), "torso": (20, 0, 0), "head": (-13, 0, 0)},
                  80: {"leg_L": (62, 14, 0), "leg_R": (62, 14, 0), "arm_L": (70, 12, 0), "arm_R": (70, 12, 0), "torso": (18, 0, 0), "head": (-12, 0, 0)}}, 80)
    # scoot (standing on an e-scooter)
    A["scoot"] = ({0: {"leg_L": (12, 0, 0), "leg_R": (-8, 0, 0), "arm_L": (52, 8, 0), "arm_R": (52, 8, 0), "torso": (6, 0, 0), "_bob": 0},
                   30: {"leg_L": (12, 0, 0), "leg_R": (-8, 0, 0), "arm_L": (54, 8, 0), "arm_R": (54, 8, 0), "torso": (7, 0, 0), "_bob": -0.01},
                   60: {"leg_L": (12, 0, 0), "leg_R": (-8, 0, 0), "arm_L": (52, 8, 0), "arm_R": (52, 8, 0), "torso": (6, 0, 0), "_bob": 0}}, 60)
    # wave (customers / shop owners)
    A["wave"] = ({0: {"arm_R": (0, 150, 0), "arm_L": (0, 4, 0), "head": (0, 0, 0)},
                  7: {"arm_R": (0, 125, 0), "arm_L": (0, 4, 0), "head": (0, 0, 5)},
                  14: {"arm_R": (0, 155, 0), "arm_L": (0, 4, 0), "head": (0, 0, 0)},
                  21: {"arm_R": (0, 125, 0), "arm_L": (0, 4, 0), "head": (0, 0, -5)},
                  28: {"arm_R": (0, 150, 0), "arm_L": (0, 4, 0), "head": (0, 0, 0)}}, 28)
    # cheer (delivery done)
    A["cheer"] = ({0: {"arm_L": (0, 160, 0), "arm_R": (0, 160, 0), "_bob": 0},
                   8: {"arm_L": (0, 135, 0), "arm_R": (0, 135, 0), "_bob": 0.12},
                   16: {"arm_L": (0, 160, 0), "arm_R": (0, 160, 0), "_bob": 0}}, 16)
    # carrying a box
    A["carry_idle"] = ({0: {"arm_L": (78, -6, 0), "arm_R": (78, -6, 0), "torso": (-2, 0, 0), "_bob": 0},
                        30: {"arm_L": (76, -6, 0), "arm_R": (76, -6, 0), "torso": (-1, 0, 0), "_bob": -0.01},
                        60: {"arm_L": (78, -6, 0), "arm_R": (78, -6, 0), "torso": (-2, 0, 0), "_bob": 0}}, 60)
    cw = walk(30, 0, 0, 0.045, 32)
    for fr in cw:
        cw[fr]["arm_L"] = (78, -6, 0); cw[fr]["arm_R"] = (78, -6, 0); cw[fr]["torso"] = (-2, 0, 0)
    A["carry_walk"] = (cw, 32)
    cr = walk(50, 0, 8, 0.07, 20)
    for fr in cr:
        cr[fr]["arm_L"] = (80, -6, 0); cr[fr]["arm_R"] = (80, -6, 0)
    A["carry_run"] = (cr, 20)
    # sit (benches) - used by idle pedestrians
    A["sit"] = ({0: {"leg_L": (88, 4, 0), "leg_R": (88, 4, 0), "arm_L": (30, 2, 0), "arm_R": (30, 2, 0), "_bob": 0},
                 60: {"leg_L": (88, 4, 0), "leg_R": (88, 4, 0), "arm_L": (32, 2, 0), "arm_R": (32, 2, 0), "_bob": 0}}, 60)
    loops = {"jump": False}
    for name, (keys, n) in A.items():
        make_action(rig, name, keys, n, loops.get(name, True))
    return list(A.keys())


def build_character():
    clear_scene()
    sc = work_scene()
    sc.render.fps = 30
    rig = make_armature("courier")
    body = build_body(rig)
    names = build_actions(rig)
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
    r1 = export_glb(rig, "models/characters/courier.glb", animations=True)
    return r1, names, tri_count(rig)

# ---------------------------------------------------------------- accessories (cosmetics)
# Modelled in character space (origin at the character's feet); the game attaches them to
# the head / torso bone while the skeleton is in its rest pose.

def build_accessories():
    out = []
    def one(name, fn):
        clear_scene()
        root = empty(name)
        fn(root)
        out.append(export_glb(root, "models/characters/acc_%s.glb" % name))

    def cap(root):
        c = mat("paint", hexc("#ff7a1f"), rough=0.6)
        w = mat("acc_white", hexc("#ffffff"), rough=0.6)
        mb = MB()
        mb.box((0.6, 0.56, 0.16), (0, 0.0, 1.92), c, bevel=0.05)
        mb.box((0.5, 0.26, 0.04), (0, -0.36, 1.86), c, bevel=0.015)
        mb.box((0.16, 0.02, 0.08), (0, -0.285, 1.93), w)
        mb.finish("acc_cap", parent=root)

    def beanie(root):
        c = mat("paint", hexc("#3a7bd5"), rough=0.9)
        w = mat("acc_white", hexc("#ffffff"), rough=0.9)
        mb = MB()
        mb.box((0.6, 0.56, 0.24), (0, 0.0, 1.95), c, bevel=0.08)
        mb.box((0.62, 0.58, 0.08), (0, 0.0, 1.84), c, bevel=0.03)
        mb.sphere(0.08, (0, 0, 2.12), w, seg=8, rings=5)
        mb.finish("acc_beanie", parent=root)

    def helmet(root):
        c = mat("paint", hexc("#e53935"), rough=0.35)
        v = mat("acc_visor", hexc("#27313f"), rough=0.1, metal=0.4)
        mb = MB()
        mb.box((0.64, 0.6, 0.3), (0, 0.02, 1.92), c, bevel=0.12)
        mb.box((0.66, 0.5, 0.28), (0, 0.06, 1.72), c, bevel=0.06)
        mb.box((0.5, 0.05, 0.16), (0, -0.29, 1.78), v, bevel=0.02)
        mb.finish("acc_helmet", parent=root)

    def crown(root):
        g = mat("paint", hexc("#ffc928"), rough=0.25, metal=0.8)
        j = mat("acc_gem", hexc("#e0245e"), rough=0.2, emit=hexc("#e0245e"), emit_strength=0.4)
        mb = MB()
        mb.cyl(0.25, 0.14, (0, 0, 1.93), g, verts=10, smooth=False)
        for i in range(5):
            a = i / 5 * math.tau
            mb.box((0.1, 0.06, 0.16), (math.sin(a) * 0.23, math.cos(a) * 0.23, 2.07), g,
                   rot=(0, 0, -math.degrees(a)), taper=(0.2, 0.6))
        mb.box((0.07, 0.04, 0.07), (0, -0.26, 1.94), j)
        mb.finish("acc_crown", parent=root)

    def tophat(root):
        b = mat("paint", hexc("#23252b"), rough=0.6)
        r = mat("acc_band", hexc("#c62828"), rough=0.6)
        mb = MB()
        mb.cyl(0.4, 0.04, (0, 0, 1.88), b, verts=16)
        mb.cyl(0.25, 0.4, (0, 0, 2.1), b, verts=16)
        mb.cyl(0.255, 0.08, (0, 0, 1.94), r, verts=16)
        mb.finish("acc_tophat", parent=root)

    def headphones(root):
        b = mat("paint", hexc("#7c4dff"), rough=0.4)
        d = mat("acc_dark", hexc("#2a2d34"), rough=0.5)
        mb = MB()
        mb.box((0.62, 0.1, 0.06), (0, 0, 1.93), b, bevel=0.02)
        for x in (0.3, -0.3):
            mb.box((0.06, 0.1, 0.24), (x, 0, 1.8), b)
            mb.box((0.1, 0.2, 0.22), (x * 1.02, 0, 1.64), d, bevel=0.04)
        mb.finish("acc_headphones", parent=root)

    def shades(root):
        d = mat("acc_dark", hexc("#15171c"), rough=0.1, metal=0.5)
        mb = MB()
        for x in (0.11, -0.11):
            mb.box((0.17, 0.03, 0.09), (x, -0.27, 1.68), d, bevel=0.015)
        mb.box((0.5, 0.025, 0.025), (0, -0.27, 1.71), d)
        mb.finish("acc_shades", parent=root)

    def bag(root):
        c = mat("paint", hexc("#ff7a1f"), rough=0.7)
        s = mat("acc_dark", hexc("#2a2d34"), rough=0.6)
        w = mat("acc_white", hexc("#ffffff"), rough=0.6)
        mb = MB()
        mb.box((0.62, 0.42, 0.62), (0, 0.42, 1.1), c, bevel=0.06)
        mb.box((0.3, 0.02, 0.18), (0, 0.635, 1.15), w)
        for x in (0.22, -0.22):
            mb.box((0.07, 0.42, 0.06), (x, 0.0, 1.36), s)
        mb.finish("acc_bag", parent=root)

    def jetpack(root):
        m = mat("paint", hexc("#9aa3ad"), rough=0.3, metal=0.8)
        f = mat("acc_flame", hexc("#ffb02e"), emit=hexc("#ff8a1f"), emit_strength=2.0)
        mb = MB()
        for x in (0.15, -0.15):
            mb.cyl(0.13, 0.6, (x, 0.32, 1.08), m, verts=10)
            mb.cyl(0.1, 0.12, (x, 0.32, 0.72), f, verts=10, r2=0.02)
        mb.box((0.3, 0.12, 0.4), (0, 0.24, 1.1), m)
        mb.finish("acc_jetpack", parent=root)

    for n, fn in (("cap", cap), ("beanie", beanie), ("helmet", helmet), ("crown", crown),
                  ("tophat", tophat), ("headphones", headphones), ("shades", shades),
                  ("bag", bag), ("jetpack", jetpack)):
        one(n, fn)
    return out
