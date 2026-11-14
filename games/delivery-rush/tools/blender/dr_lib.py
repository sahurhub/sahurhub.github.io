# DELIVERY RUSH - Blender helper library.
# Run inside Blender (via exec). Builds low-poly, blocky models from scripted primitives
# and exports them as GLB. Blender is Z-up; models face -Y so that after the glTF Y-up
# conversion they face +Z in three.js (the game's forward axis).
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler

OUT = r"C:\Users\User\Desktop\Claude Work\delivery-rush\assets"
SCENE_NAME = "DR_Work"

# ---------------------------------------------------------------- scene / materials

def work_scene():
    sc = bpy.data.scenes.get(SCENE_NAME)
    if sc is None:
        sc = bpy.data.scenes.new(SCENE_NAME)
    if bpy.context.window:
        bpy.context.window.scene = sc
    return sc


def clear_scene():
    sc = work_scene()
    for ob in list(sc.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)
    return sc


_MATS = {}

def mat(name, color, rough=0.65, metal=0.0, emit=None, emit_strength=1.0, alpha=1.0):
    """Principled material with flat colour. Names matter: the game looks for
    'paint', 'paint2', 'glass', 'headlight', 'brakelight', 'tire', 'rim', 'skin' ..."""
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    col = (color[0], color[1], color[2], 1.0)
    p.inputs["Base Color"].default_value = col
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit is not None:
        for key in ("Emission Color", "Emission"):
            if key in p.inputs:
                p.inputs[key].default_value = (emit[0], emit[1], emit[2], 1.0)
                break
        if "Emission Strength" in p.inputs:
            p.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        p.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    m.diffuse_color = col
    _MATS[name] = m
    return m


def hexc(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    # sRGB -> linear, so the colour in the game matches the hex value
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b))

# ---------------------------------------------------------------- mesh builder

class MB:
    """Accumulates primitives into one mesh with several material slots."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _merge(self, bm, m, smooth=False, matrix=None):
        if matrix is not None:
            bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
        idx = self._mi(m)
        for f in bm.faces:
            f.material_index = idx
            f.smooth = smooth
        tmp = bpy.data.meshes.new("_tmp")
        bm.to_mesh(tmp)
        bm.free()
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)

    @staticmethod
    def _xf(loc, rot, scale=(1, 1, 1)):
        r = Euler([math.radians(a) for a in (rot or (0, 0, 0))], 'XYZ').to_matrix().to_4x4()
        s = Matrix.Diagonal((scale[0], scale[1], scale[2], 1.0))
        return Matrix.Translation(Vector(loc)) @ r @ s

    def box(self, size, loc=(0, 0, 0), m=None, bevel=0.0, rot=None, taper=None):
        """size (x,y,z); loc = centre. taper=(sx,sy) scales the top face."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        if taper:
            for v in bm.verts:
                if v.co.z > 0:
                    v.co.x *= taper[0]
                    v.co.y *= taper[1]
        for v in bm.verts:
            v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        if bevel > 0:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, min(size) * 0.45),
                            segments=1, affect='EDGES', clamp_overlap=True, profile=0.5)
        self._merge(bm, m, False, self._xf(loc, rot))
        return self

    def cyl(self, r, depth, loc=(0, 0, 0), m=None, axis='Z', verts=12, r2=None, rot=None,
            smooth=True, bevel=0.0):
        """Cylinder (or cone if r2 given) centred at loc, along axis."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                              radius1=r, radius2=(r if r2 is None else r2), depth=depth)
        if bevel > 0:
            caps = [e for e in bm.edges if len(e.link_faces) == 2 and
                    any(len(f.verts) > 4 for f in e.link_faces)]
            if caps:
                bmesh.ops.bevel(bm, geom=caps, offset=bevel, segments=1, affect='EDGES',
                                clamp_overlap=True)
        base = {'Z': (0, 0, 0), 'X': (0, 90, 0), 'Y': (90, 0, 0)}[axis]
        m1 = self._xf((0, 0, 0), base)
        bmesh.ops.transform(bm, matrix=m1, verts=bm.verts)
        idx = self._mi(m)
        for f in bm.faces:
            f.material_index = idx
            f.smooth = smooth and len(f.verts) == 4
        tmp = bpy.data.meshes.new("_tmp")
        bmesh.ops.transform(bm, matrix=self._xf(loc, rot), verts=bm.verts)
        bm.to_mesh(tmp); bm.free()
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        return self

    def sphere(self, r, loc=(0, 0, 0), m=None, seg=10, rings=6, scale=(1, 1, 1), smooth=True):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
        self._merge(bm, m, smooth, self._xf(loc, None, scale))
        return self

    def tube(self, p0, p1, r, m=None, verts=8):
        """Cylinder between two points (frame tubes)."""
        a, b = Vector(p0), Vector(p1)
        d = b - a
        L = d.length
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=L)
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        mtx = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
        bmesh.ops.transform(bm, matrix=mtx, verts=bm.verts)
        idx = self._mi(m)
        for f in bm.faces:
            f.material_index = idx
            f.smooth = len(f.verts) == 4
        tmp = bpy.data.meshes.new("_tmp")
        bm.to_mesh(tmp); bm.free()
        self.bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        return self

    def prism(self, w, d, h, loc=(0, 0, 0), m=None, rot=None):
        """Triangular prism (gable roof): width w along X, depth d along Y, apex height h."""
        bm = bmesh.new()
        pts = [(-w / 2, 0), (w / 2, 0), (0, h)]
        vs = []
        for y in (-d / 2, d / 2):
            vs.append([bm.verts.new((x, y, z)) for x, z in pts])
        bm.faces.new(vs[0][::-1]); bm.faces.new(vs[1])
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((vs[0][i], vs[0][j], vs[1][j], vs[1][i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        self._merge(bm, m, False, self._xf(loc, rot))
        return self

    def finish(self, name, origin=(0, 0, 0), parent=None, geom_local=False):
        """Geometry is in world space unless geom_local (then it is already relative to origin)."""
        me = bpy.data.meshes.new(name)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=0.0001)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        # move geometry so the object origin sits at `origin`
        if not geom_local:
            bmesh.ops.translate(self.bm, vec=-Vector(origin), verts=self.bm.verts)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        work_scene().collection.objects.link(ob)
        ob.location = Vector(origin)
        if parent is not None:
            ob.parent = parent
            ob.location = Vector(origin) - parent_world(parent)
        return ob


def parent_world(p):
    return p.matrix_world.translation if p else Vector((0, 0, 0))


def empty(name, loc=(0, 0, 0), parent=None, size=0.2):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    work_scene().collection.objects.link(e)
    e.location = Vector(loc)
    if parent is not None:
        e.parent = parent
        e.location = Vector(loc) - parent_world(parent)
    bpy.context.view_layer.update()
    return e


def reparent_keep(ob, parent):
    """Parent while keeping the world transform (works for rotated parents)."""
    bpy.context.view_layer.update()
    mw = ob.matrix_world.copy()
    ob.parent = parent
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.matrix_basis = parent.matrix_world.inverted() @ mw
    bpy.context.view_layer.update()
    return ob


def wheel(name, r, w, loc, tire, rim, parent=None, knobby=False, spokes=0, hub=None):
    """Wheel with its origin at the axle centre; axle along X."""
    mb = MB()
    mb.cyl(r, w, (0, 0, 0), tire, axis='X', verts=18, bevel=min(r, w) * 0.18)
    mb.cyl(r * 0.62, w * 1.04, (0, 0, 0), rim, axis='X', verts=12, smooth=False)
    if hub:
        mb.cyl(r * 0.2, w * 1.12, (0, 0, 0), hub, axis='X', verts=8, smooth=False)
    if knobby:
        n = 14
        for i in range(n):
            a = i / n * math.tau
            mb.box((w * 1.02, r * 0.16, r * 0.12),
                   (0, math.cos(a) * r * 0.98, math.sin(a) * r * 0.98), tire,
                   rot=(math.degrees(a), 0, 0))
    for i in range(spokes):
        a = i / spokes * math.pi
        mb.box((w * 0.25, r * 1.2, r * 0.05), (0, 0, 0), rim, rot=(math.degrees(a), 0, 0))
    ob = mb.finish(name, origin=loc, parent=parent, geom_local=True)
    return ob

# ---------------------------------------------------------------- export

def select_tree(root):
    bpy.ops.object.select_all(action='DESELECT')
    def rec(o):
        o.select_set(True)
        for c in o.children:
            rec(c)
    rec(root)
    bpy.context.view_layer.objects.active = root


def export_glb(root, rel_path, animations=False):
    path = os.path.join(OUT, rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_tree(root)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_cameras=False, export_lights=False,
              export_animations=animations, export_extras=False)
    if 'export_draco_mesh_compression_enable' in props:
        kw['export_draco_mesh_compression_enable'] = False
    if animations and 'export_animation_mode' in props:
        kw['export_animation_mode'] = 'ACTIONS'
    if 'export_skins' in props:
        kw['export_skins'] = True
    # Note: do not redirect stdout or pass export_loglevel here. In Blender 5.3 the first made
    # each export take minutes (Blender looked frozen) and the second raises KeyError.
    bpy.ops.export_scene.gltf(**kw)
    return path, os.path.getsize(path)


def preview(rel_paths, spacing=4.0, cols=6):
    """Import exported GLBs side by side into the work scene, to check them with `look`."""
    clear_scene()
    names = []
    for i, rp in enumerate(rel_paths):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, rp))
        new = [o for o in bpy.data.objects if o not in before]
        roots = [o for o in new if o.parent is None]
        for r in roots:
            r.location.x += (i % cols) * spacing
            r.location.y += (i // cols) * spacing
            names.append(r.name)
    return names


def tri_count(root):
    n = 0
    def rec(o):
        nonlocal n
        if o.type == 'MESH':
            for p in o.data.polygons:
                n += len(p.vertices) - 2
        for c in o.children:
            rec(c)
    rec(root)
    return n
