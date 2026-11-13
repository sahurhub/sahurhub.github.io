"""
process_car.py - turns an imported Sketchfab F1 car into game-ready GLB files.

Run inside Blender (through the Blender MCP) right after importing one car:
    exec(open(r"...\\tools\\blender\\process_car.py").read())
    process_latest("mclaren", r"...\\assets\\cars\\2026", dict(title=..., author=..., license=..., url=...))

What it does
  1. Bakes every mesh into car space and sorts parts into body / wheels / steering wheel.
     Two kinds of source model are understood:
       "grouped"   - a few big meshes, one per material (wheels all in one mesh)
       "hierarchy" - many small parts under named nodes (WHEEL_LF, STEER_HR, modex, ...)
  2. Wheels: each wheel's real axle is measured from its tyre (front wheels on these models
     have about 3 degrees of camber). The wheel node is turned so its local X axis IS that
     axle, so the game can spin it without any wobble.
  3. Active aero: the moving rear wing flap and front wing flaps are cut out into their own
     nodes "rw_flap" and "fw_flap", with the node origin on the hinge line, so the game can
     rotate them about local X. Rear hinge = flap trailing edge (opens like DRS, leading edge
     rises). Front hinge = flap leading edge (trailing edge drops).
  4. Car space: origin on the ground midway between the axles, front = -Y in Blender (+Z in
     glTF / three.js), +X = the car's left, scaled to 1.90 m wide.
  5. Three levels of detail: LOD0 (player, with steering wheel), LOD1 (nearby opponents),
     LOD2 "far" (one static mesh). Textures are shrunk; exports <team>_lod0.glb, <team>_lod1.glb
     and <team>.json (measurements).
"""
import bpy, bmesh, json, math, os, re
import numpy as np
from mathutils import Vector, Matrix

WHEEL_PAT = re.compile(r'tread|tyre|tire|sidewall|discs|wheel|rim', re.I)
SW_MAIN = re.compile(r'(^|_)sw($|\.)|steering_?wheel', re.I)
FRONT_TOP_ONLY = {'mercedes', 'astonmartin'}   # these teams move only the top front flap

# ---- "grouped" models: fraction of triangles kept, by material keyword (first match wins) ----
LOD0_RATIOS = [('carbon1', 0.38), ('wheel_hub', 0.40), ('paint', 0.75), ('carbon2', 0.42),
               ('cinture', 0.15), ('generics', 0.60), ('detail', 0.60), ('decals', 1.0),
               ('tread', 0.50), ('sidewall', 1.0), ('tyre_sides', 0.6), ('chrome', 0.30), ('clearled', 0.30),
               ('clared', 0.3), ('_sw_carbon', 0.5), ('_sw', 0.55)]
LOD1_RATIOS = [('carbon1', 0.07), ('wheel_hub', 0.035), ('paint', 0.45), ('carbon2', 0.08),
               ('generics', 0.10), ('detail', 0.14), ('decals', 1.0), ('number', 1.0),
               ('tread', 0.05), ('sidewall', 0.14), ('tyre_sides', 0.05), ('rear_light', 1.0), ('color', 1.0),
               ('mirror', 1.0)]
LOD1_DROP = re.compile(r'cinture|chrome|glass|black_s|discs|interior|carbon3', re.I)
LOD2_RATIOS = [('carbon1', 0.02), ('carbon2', 0.03), ('paint', 0.075), ('detail', 0.03), ('tread', 0.03)]
LOD2_ONLY = ('paint', 'carbon1', 'carbon2', 'detail')

# ---- "hierarchy" models: triangle budgets, shared out by importance -------------------------
H_KEEP = re.compile(r'decal|number|rear_light|mirror', re.I)            # never simplified
H_WEIGHT = [('chasis', 2.4), ('chassis', 2.4), ('paint', 2.4), ('carbon', 1.0), ('wheel_hub', 0.8), ('cinture', 0.2)]
H_LOD1_DROP = re.compile(r'cinture|cockpit|chrome|glass|foam|lcd|kers|led|negro|black|discs|tag_|rtt_|generics', re.I)
H_BUDGET = dict(body0=96000, wheels0=26000, steer0=14000, body1=24000, wheels1=2800, far=4800)

TEX_LOD0 = [('sw_decals', 1024), ('decal', 2048), ('chasis', 2048), ('chassis', 1024), ('sidewall', 1024), ('tire', 1024), ('tyre', 1024),
            ('generics', 1024), ('detail', 1024), ('paint', 1024), ('_sw_base', 1024), ('lcd', 512), ('cinture', 512), ('', 512)]
TEX_LOD1 = [('decal', 1024), ('chasis', 1024), ('chassis', 512), ('sidewall', 512), ('tire', 512), ('tyre', 512), ('generics', 512),
            ('detail', 512), ('paint', 512), ('', 256)]


def _ratio(table, name, default):
    low = name.lower()
    for key, r in table:
        if key in low:
            return r
    return default


def _fix_normals(me):
    if 'custom_normal' in me.attributes:
        try:
            me.attributes.remove(me.attributes['custom_normal'])
        except Exception:
            pass
    n = len(me.polygons)
    if n:
        me.polygons.foreach_set('use_smooth', [True] * n)
        try:
            me.set_sharp_from_angle(angle=math.radians(38))
        except Exception:
            pass
    me.update()


def _world_mesh(obj, M0):
    """Copy of obj's mesh in final car space, duplicate vertices merged.
    Each face remembers which separate piece of the ORIGINAL mesh it came from (face attribute
    'isl'), because merging vertices can glue touching pieces (e.g. a wing flap and its
    endplate) into one."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    M = M0 @ obj.matrix_world
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    if M.determinant() < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    lay = bm.faces.layers.int.new('isl')
    bm.faces.ensure_lookup_table()
    seen = bytearray(len(bm.faces))
    n_isl = 0
    for f in bm.faces:
        if seen[f.index]:
            continue
        seen[f.index] = 1
        stack = [f]
        while stack:
            g = stack.pop()
            g[lay] = n_isl
            for e in g.edges:
                for h in e.link_faces:
                    if not seen[h.index]:
                        seen[h.index] = 1
                        stack.append(h)
        n_isl += 1
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    me = bpy.data.meshes.new(obj.name + '_w')
    bm.to_mesh(me)
    bm.free()
    me.materials.append(obj.data.materials[0])
    _fix_normals(me)
    return me


def _decimate(me, ratio, coll):
    if ratio >= 0.999 or len(me.polygons) < 40:
        return me
    ob = bpy.data.objects.new('tmp_dec', me)
    coll.objects.link(ob)
    mod = ob.modifiers.new('dec', 'DECIMATE')
    mod.ratio = ratio
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    bpy.data.objects.remove(ob)
    if not new.materials:
        new.materials.append(me.materials[0])
    _fix_normals(new)
    return new


def _tris(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def _join(meshes, name):
    out = bpy.data.meshes.new(name)
    mats = []
    bm = bmesh.new()
    for me in meshes:
        n0 = len(bm.faces)
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        mat = me.materials[0]
        if mat not in mats:
            mats.append(mat)
        idx = mats.index(mat)
        for i in range(n0, len(bm.faces)):
            bm.faces[i].material_index = idx
    bm.to_mesh(out)
    bm.free()
    for m in mats:
        out.materials.append(m)
    out.validate()
    out.update()
    return out


def _keep_faces(me, keep, name):
    """New mesh with only the faces whose index is in `keep` (a set)."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    out = bpy.data.meshes.new(name)
    bm.to_mesh(out)
    bm.free()
    out.materials.append(me.materials[0])
    _fix_normals(out)
    return out


def _islands(me):
    """Separate pieces (from the 'isl' face attribute): list of (face index set, min, max)."""
    att = me.attributes.get('isl')
    ids = np.zeros(len(me.polygons), dtype=np.int64)
    if att is not None:
        att.data.foreach_get('value', ids)
    groups = {}
    for p in me.polygons:
        groups.setdefault(int(ids[p.index]), []).append(p)
    out = []
    co = _verts_np(me)
    for polys in groups.values():
        vi = [v for p in polys for v in p.vertices]
        pts = co[vi]
        out.append(({p.index for p in polys}, Vector(pts.min(axis=0)), Vector(pts.max(axis=0))))
    return out


def _split_quadrant(me, sx, sy):
    """Keep only faces in the (sx, sy) quadrant. y=0 is mid-wheelbase, front is -Y, left is +X."""
    keep = set()
    for p in me.polygons:
        c = p.center
        if c.x * sx > 0 and c.y * sy > 0:
            keep.add(p.index)
    return _keep_faces(me, keep, me.name + '_q')


def _bbox(meshes):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for me in meshes:
        for v in me.vertices:
            for i in range(3):
                mn[i] = min(mn[i], v.co[i])
                mx[i] = max(mx[i], v.co[i])
    return mn, mx


def _verts_np(me):
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    return co.reshape(-1, 3)


def _make_obj(name, me, coll, frame=None):
    """frame: 4x4 Matrix for the object's origin/orientation; mesh is moved into that frame."""
    if frame is not None:
        me.transform(frame.inverted())
        me.update()
    ob = bpy.data.objects.new(name, me)
    if frame is not None:
        ob.matrix_world = frame
    coll.objects.link(ob)
    return ob


def _resize_images(mats, table):
    done = set()
    for mat in mats:
        if not mat or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type != 'TEX_IMAGE' or not node.image:
                continue
            img = node.image
            if img.name in done:
                continue
            done.add(img.name)
            target = _ratio(table, img.name, 512)
            w, h = img.size
            if max(w, h) > target and w > 0:
                s = target / max(w, h)
                img.scale(max(1, int(w * s)), max(1, int(h * s)))
                try:
                    img.pack()
                except Exception as e:
                    print('pack failed', img.name, e)


def _flatten_tiny_textures(mats, max_px=32):
    """A texture of a few pixels is just a colour: store the colour and drop the image."""
    for mat in mats:
        if not mat or not mat.node_tree:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        inp = bsdf.inputs['Base Color']
        if not inp.is_linked:
            continue
        node = inp.links[0].from_node
        if node.type != 'TEX_IMAGE' or not node.image:
            continue
        img = node.image
        w, h = img.size
        if w == 0 or max(w, h) > max_px or bsdf.inputs['Alpha'].is_linked:
            continue
        px = list(img.pixels[:])
        n = max(1, len(px) // 4)
        avg = [sum(px[c::4]) / n for c in range(3)]
        mat.node_tree.links.remove(inp.links[0])
        inp.default_value = (avg[0], avg[1], avg[2], 1.0)


def _strip_extra_maps(mats, also_rough=False):
    for mat in mats:
        if not mat or not mat.node_tree:
            continue
        for node in list(mat.node_tree.nodes):
            if node.type == 'NORMAL_MAP':
                mat.node_tree.nodes.remove(node)
        if also_rough:
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf:
                for key in ('Roughness', 'Metallic'):
                    for l in list(bsdf.inputs[key].links):
                        mat.node_tree.links.remove(l)


def _export(objs, path):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_cameras=False, export_lights=False,
              export_animations=False, export_extras=False)
    fmts = [i.identifier for i in props['export_image_format'].enum_items]
    if 'WEBP' in fmts:
        kw['export_image_format'] = 'WEBP'
        if 'export_image_quality' in props:
            kw['export_image_quality'] = 82
    if 'export_draco_mesh_compression_enable' in props:
        kw['export_draco_mesh_compression_enable'] = True
        kw['export_draco_mesh_compression_level'] = 6
        kw['export_draco_position_quantization'] = 14
        kw['export_draco_normal_quantization'] = 10
        kw['export_draco_texcoord_quantization'] = 12
    return bpy.ops.export_scene.gltf(**kw)


def _plan(parts, budget, keep=H_KEEP):
    """Share a triangle budget between parts. parts = [(key, tris, material name)]."""
    def w(n):
        return _ratio(H_WEIGHT, n, 1.0)
    fixed = sum(t for k, t, n in parts if keep.search(n) or t < 200)
    rest = sum(t * w(n) for k, t, n in parts if not (keep.search(n) or t < 200))
    r = max(0.0, budget - fixed) / max(rest, 1)
    return {k: (1.0 if (keep.search(n) or t < 200) else max(0.02, min(1.0, r * w(n)))) for k, t, n in parts}


def _classify_flaps(isl, wb, team):
    """isl: list of (key, face set, mn, mx). Returns {(key, island no): 'rw' | 'fw'}."""
    res = {}
    span = lambda a, b, i: b[i] - a[i]
    cen = lambda a, b, i: (a[i] + b[i]) / 2
    rear = [(k, j, a, b) for k, j, f, a, b in isl if cen(a, b, 1) > wb / 2 + 0.25 and cen(a, b, 2) > 0.68 and span(a, b, 0) > 0.3]
    if rear:
        main = max(rear, key=lambda r: span(r[2], r[3], 1))
        top = main[3].z
        ymid = (min(r[2].y for r in rear) + max(r[3].y for r in rear)) / 2
        for k, j, a, b in rear:
            if b.z > top + 0.008 and cen(a, b, 1) > ymid:
                res[(k, j)] = 'rw'
    front = [(k, j, a, b) for k, j, f, a, b in isl
             if cen(a, b, 1) < -wb / 2 - 0.3 and cen(a, b, 2) < 0.45 and span(a, b, 0) > 0.3 and span(a, b, 2) < 0.16]
    if front:
        ymin = min(r[2].y for r in front)
        mains = [r for r in front if r[2].y < ymin + 0.03]
        main_top = max(r[3].z for r in mains)
        cand = [r for r in front if r[2].y > ymin + 0.1 and r[3].z > main_top - 0.005]
        if team in FRONT_TOP_ONLY and cand:
            zt = max(r[3].z for r in cand)
            cand = [r for r in cand if r[3].z >= zt - 0.03]
        for k, j, a, b in cand:
            res[(k, j)] = 'fw'
    return res


def process(cfg):
    team = cfg['team']
    root = bpy.data.objects[cfg['root']]
    out_dir = cfg['out_dir']
    os.makedirs(out_dir, exist_ok=True)
    target_width = cfg.get('width', 1.90)

    src = [o for o in root.children_recursive if o.type == 'MESH' and o.data.materials and o.data.materials[0]]

    def wbox(o):
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return ([min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)])

    def mat_of(o):
        return o.data.materials[0].name

    def subtree_meshes(prefix):
        nodes = [o for o in root.children_recursive if o.name.lower().startswith(prefix)]
        return {m.name for n in nodes for m in ([n] + list(n.children_recursive)) if m.type == 'MESH'}

    wheel_nodes = [o for o in root.children_recursive if o.name.upper().startswith('WHEEL_') and any(c.type == 'MESH' for c in o.children_recursive)]
    hier = len(wheel_nodes) >= 4
    flap_obj = {}
    if hier:
        wheel_set = set(m.name for wn in wheel_nodes for m in wn.children_recursive if m.type == 'MESH')
        steer_set = subtree_meshes('steer_hr')
        for n in subtree_meshes('modex'):
            flap_obj[n] = 'rw'
        for n in subtree_meshes('modez'):
            flap_obj[n] = 'fw'
        wheels_src = [o for o in src if o.name in wheel_set]
        steer_src = [o for o in src if o.name in steer_set]
        body_src = [o for o in src if o.name not in wheel_set and o.name not in steer_set]
    else:
        sw_main = next((o for o in src if SW_MAIN.search(mat_of(o))), None)
        sw_box = None
        if sw_main:
            mn, mx = wbox(sw_main)
            sw_box = ([v - 0.03 for v in mn], [v + 0.03 for v in mx])
        wheels_src, steer_src, body_src = [], [], []
        for o in src:
            n = mat_of(o)
            mn, mx = wbox(o)
            wheel_like = (mx[0] - mn[0]) > 1.5 and (mx[1] - mn[1]) > 3.0 and mx[2] < 0.78
            inside_sw = sw_box and all(mn[i] >= sw_box[0][i] and mx[i] <= sw_box[1][i] for i in range(3)) and 'glass' not in n.lower()
            if WHEEL_PAT.search(n) and wheel_like:
                wheels_src.append(o)
            elif o is sw_main or inside_sw:
                steer_src.append(o)
            else:
                body_src.append(o)
    treads = [o for o in wheels_src if 'tread' in mat_of(o).lower()]
    if not treads:
        treads = [max(wheels_src, key=lambda o: wbox(o)[1][0] - wbox(o)[0][0])]
    print('MODE:', 'hierarchy' if hier else 'grouped', '| parts', len(src))
    print('WHEEL parts:', sorted(set(mat_of(o) for o in wheels_src)))
    print('STEER parts:', sorted(set(mat_of(o) for o in steer_src)))

    tread_names = {o.name for o in treads}

    def name_of(o):
        n = mat_of(o)
        return 'tread_' + n if (o.name in tread_names and 'tread' not in n.lower()) else n

    # ---- measure the car in its imported position -------------------------------------
    pts = [o.matrix_world @ v.co for o in treads for v in o.data.vertices]
    xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = [p.z for p in pts]
    ymid0 = (min(ys) + max(ys)) / 2
    front = [p for p in pts if p.y < ymid0]
    rear = [p for p in pts if p.y >= ymid0]
    yf = (min(p.y for p in front) + max(p.y for p in front)) / 2
    yr = (min(p.y for p in rear) + max(p.y for p in rear)) / 2
    scale = target_width / (max(xs) - min(xs))
    origin0 = Vector(((min(xs) + max(xs)) / 2, (yf + yr) / 2, min(zs)))
    M0 = Matrix.Scale(scale, 4) @ Matrix.Translation(-origin0)
    wb = (yr - yf) * scale
    print(f'scale {scale:.4f}  wheelbase {wb:.3f} m  width {target_width:.3f} m')

    coll = bpy.data.collections.new('car_' + team)
    bpy.context.scene.collection.children.link(coll)
    base = {o.name: _world_mesh(o, M0) for o in src}

    # ---- wheels: true centre and axle of each tyre (front wheels have camber) ----------
    quads = {'fl': (1, -1), 'fr': (-1, -1), 'rl': (1, 1), 'rr': (-1, 1)}
    # A whole tyre (tread + sidewalls) is a fat ring: its thinnest direction is the axle.
    # (A sidewall alone is two flat rings and can fool this, so use every wheel part.)
    named_tread = any('tread' in mat_of(o).lower() for o in treads)
    tv = np.concatenate([_verts_np(base[o.name]) for o in (treads if named_tread else wheels_src)])
    frames, radii, widths, cambers = {}, {}, {}, {}
    for key, (sx, sy) in quads.items():
        t = tv[(tv[:, 0] * sx > 0) & (tv[:, 1] * sy > 0)]
        c = t.mean(axis=0)
        w, v = np.linalg.eigh(np.cov((t - c).T))
        ax = v[:, 0] * (1 if v[0, 0] > 0 else -1)          # axle direction, pointing to car's left (+X)
        if abs(ax[0]) < math.cos(math.radians(8)):         # not believable: fall back to a straight axle
            print('axle fit rejected for', key, np.round(ax, 3))
            ax = np.array([1.0, 0.0, 0.0])
            c = (t.min(axis=0) + t.max(axis=0)) / 2
        xa = Vector(ax).normalized()
        za = (Vector((0, 0, 1)) - xa * xa.z).normalized()
        ya = za.cross(xa)
        R = Matrix((xa, ya, za)).transposed().to_4x4()
        frames[key] = Matrix.Translation(Vector(c)) @ R
        rel = t - c
        axial = rel @ ax
        radial = np.linalg.norm(rel - np.outer(axial, ax), axis=1)
        radii[key] = float(radial.max())
        widths[key] = float(axial.max() - axial.min())
        cambers[key] = math.degrees(math.asin(max(-1.0, min(1.0, float(ax[2])))))
    print('camber (deg):', {k: round(v, 2) for k, v in cambers.items()})

    # ---- moving wing flaps --------------------------------------------------------------
    # parts: list of (key, material name, mesh) for the body, split into static / rw / fw
    body_parts = {'body': [], 'rw': [], 'fw': []}
    if hier:
        for o in body_src:
            body_parts[flap_obj.get(o.name, 'body')].append((o.name, name_of(o), base[o.name]))
    else:
        isl = []
        for o in body_src:
            for j, (faces, a, b) in enumerate(_islands(base[o.name])):
                isl.append((o.name, j, faces, a, b))
        cls = _classify_flaps(isl, wb, team)
        per_obj = {}
        for k, j, faces, a, b in isl:
            per_obj.setdefault(k, {'body': set(), 'rw': set(), 'fw': set()})[cls.get((k, j), 'body')] |= faces
        for o in body_src:
            full = base[o.name]
            sets = per_obj.get(o.name, {'body': set(range(len(full.polygons))), 'rw': set(), 'fw': set()})
            if not sets['rw'] and not sets['fw']:
                body_parts['body'].append((o.name, name_of(o), full))
                continue
            for kind in ('body', 'rw', 'fw'):
                if not sets[kind]:
                    continue
                key = o.name + ('' if kind == 'body' else '#' + kind)
                base[key] = _keep_faces(full, sets[kind], key)
                body_parts[kind].append((key, name_of(o), base[key]))
    print('flap faces: rear', sum(len(m.polygons) for k, n, m in body_parts['rw']), 'front', sum(len(m.polygons) for k, n, m in body_parts['fw']))

    def hinge(kind):
        ms = [m for k, n, m in body_parts[kind]]
        if not ms:
            return None
        v = np.concatenate([_verts_np(m) for m in ms])
        if kind == 'rw':
            mid = v[np.abs(v[:, 0]) < 0.12]
            p = mid[np.argmax(mid[:, 1])] if len(mid) else v[np.argmax(v[:, 1])]      # trailing edge
        else:
            mid = v[(np.abs(v[:, 0]) > 0.25) & (np.abs(v[:, 0]) < 0.45)]
            p = mid[np.argmin(mid[:, 1])] if len(mid) else v[np.argmin(v[:, 1])]      # leading edge
        return Matrix.Translation(Vector((0.0, float(p[1]), float(p[2]))))

    hinges = {k: hinge(k) for k in ('rw', 'fw')}

    def tri_parts(lst):
        return [(k, _tris(m), n) for k, n, m in lst]

    def build_wheels(table, default, drop=None, suffix='', plan=None):
        objs = []
        for key, (sx, sy) in quads.items():
            parts = []
            for o in wheels_src:
                if drop and drop.search(name_of(o)):
                    continue
                q = _split_quadrant(base[o.name], sx, sy)
                if len(q.polygons) == 0:
                    bpy.data.meshes.remove(q)
                    continue
                r = plan[o.name] if plan else _ratio(table, name_of(o), default)
                parts.append(_decimate(q, r, coll))
            me = _join(parts, f'wheel_{key}{suffix}')
            objs.append(_make_obj(f'wheel_{key}', me, coll, frame=frames[key].copy()))
        return objs

    def build_group(lst, table, default, drop=None, only=None, plan=None):
        out = []
        for k, n, m in lst:
            if drop and drop.search(n):
                continue
            if only and not any(x in n.lower() for x in only):
                continue
            r = plan[k] if plan else _ratio(table, n, default)
            out.append(_decimate(m, r, coll))
        return out

    def flap_objs(table, default, drop=None, plan=None, suffix=''):
        objs = []
        for kind, node in (('rw', 'rw_flap'), ('fw', 'fw_flap')):
            if not body_parts[kind] or hinges[kind] is None:
                continue
            ms = build_group(body_parts[kind], table, default, drop=drop, plan=plan)
            if ms:
                objs.append(_make_obj(node, _join(ms, node + suffix), coll, frame=hinges[kind].copy()))
        return objs

    def big(m, size):
        mn, mx = _bbox([m])
        return max(mx[i] - mn[i] for i in range(3)) > size

    report = {}
    keep_none = re.compile(r'^$')
    all_body = body_parts['body'] + body_parts['rw'] + body_parts['fw']

    # ================= LOD0 ==============================================================
    if hier:
        plan0 = _plan(tri_parts(all_body), H_BUDGET['body0'])
        body0 = _make_obj('body', _join(build_group(body_parts['body'], None, 1, plan=plan0), 'body_lod0'), coll)
        flaps0 = flap_objs(None, 1, plan=plan0)
        wplan = _plan([(o.name, _tris(base[o.name]), name_of(o)) for o in wheels_src], H_BUDGET['wheels0'], keep=keep_none)
        wheels0 = build_wheels(None, 1, plan=wplan)
    else:
        body0 = _make_obj('body', _join(build_group(body_parts['body'], LOD0_RATIOS, 1.0), 'body_lod0'), coll)
        flaps0 = flap_objs(LOD0_RATIOS, 1.0)
        wheels0 = build_wheels(LOD0_RATIOS, 1.0)
    objs0 = [body0] + flaps0 + wheels0
    steer_info = None
    if steer_src:
        if hier:
            sp = _plan([(o.name, _tris(base[o.name]), name_of(o)) for o in steer_src], H_BUDGET['steer0'], keep=re.compile(r'lcd|decal', re.I))
            sparts = [_decimate(base[o.name], sp[o.name], coll) for o in steer_src]
        else:
            sparts = [_decimate(base[o.name], _ratio(LOD0_RATIOS, name_of(o), 1.0), coll) for o in steer_src]
        sme = _join(sparts, 'steer_lod0')
        mn, mx = _bbox([sme])
        centre = (mn + mx) / 2
        axis = Vector((0, 1, 0.0))
        lcd = next((o for o in steer_src if 'lcd' in name_of(o).lower()), None)
        if lcd:
            nsum = Vector((0, 0, 0))
            for p in base[lcd.name].polygons:
                nsum += p.normal * p.area
            if nsum.length > 1e-9:
                axis = nsum.normalized()
                if axis.y < 0:
                    axis = -axis
        zax = axis
        xax = Vector((1, 0, 0))
        yax = zax.cross(xax).normalized()
        xax = yax.cross(zax).normalized()
        T = Matrix.Translation(centre) @ Matrix((xax, yax, zax)).transposed().to_4x4()
        objs0.append(_make_obj('steer', sme, coll, frame=T))
        steer_info = dict(centre=list(centre), axis=list(axis))
    mats0 = set()
    for o in objs0:
        mats0.update(o.data.materials)
    _flatten_tiny_textures(mats0)
    if hier:
        _strip_extra_maps(mats0, also_rough=True)
    _resize_images(mats0, TEX_LOD0)
    bpy.context.view_layer.update()
    p0 = os.path.join(out_dir, f'{team}_lod0.glb')
    _export(objs0, p0)
    report['lod0_tris'] = sum(_tris(o.data) for o in objs0)
    report['lod0_bytes'] = os.path.getsize(p0)
    for o in objs0:  # free the plain names for the LOD1 nodes
        o.name = 'lod0_' + o.name

    # ================= LOD1 + LOD2 =======================================================
    if hier:
        b1 = [(k, n, m) for k, n, m in all_body if not H_LOD1_DROP.search(n) and (big(m, 0.12) or H_KEEP.search(n))]
        plan1 = _plan(tri_parts(b1), H_BUDGET['body1'])
        keys1 = {k for k, n, m in b1}
        body1 = _make_obj('body', _join(build_group([p for p in body_parts['body'] if p[0] in keys1], None, 1, plan=plan1), 'body_lod1'), coll)
        flaps1 = []
        for kind, node in (('rw', 'rw_flap'), ('fw', 'fw_flap')):
            lst = [p for p in body_parts[kind] if p[0] in keys1]
            if lst and hinges[kind] is not None:
                flaps1.append(_make_obj(node, _join(build_group(lst, None, 1, plan=plan1), node + '_lod1'), coll, frame=hinges[kind].copy()))
        w1 = [o for o in wheels_src if 'disc' not in name_of(o).lower()]
        wheels1 = build_wheels(None, 1, drop=re.compile(r'disc', re.I), suffix='_lod1',
                               plan=_plan([(o.name, _tris(base[o.name]), name_of(o)) for o in w1], H_BUDGET['wheels1'], keep=keep_none))
        f2 = [(k, n, m) for k, n, m in all_body if big(m, 0.7) and not re.search(r'decal|glass|cinture|cockpit', n, re.I)]
        far_parts = build_group(f2, None, 1, plan=_plan(tri_parts(f2), H_BUDGET['far'], keep=keep_none))
        for o in treads:
            far_parts.append(_decimate(base[o.name], 0.03, coll))
    else:
        body1 = _make_obj('body', _join(build_group(body_parts['body'], LOD1_RATIOS, 0.25, drop=LOD1_DROP), 'body_lod1'), coll)
        flaps1 = flap_objs(LOD1_RATIOS, 0.25, drop=LOD1_DROP, suffix='_lod1')
        wheels1 = build_wheels(LOD1_RATIOS, 0.2, drop=LOD1_DROP, suffix='_lod1')
        far_parts = build_group(all_body, LOD2_RATIOS, 0.03, only=LOD2_ONLY)
        for o in treads:
            far_parts.append(_decimate(base[o.name], _ratio(LOD2_RATIOS, 'tread', 0.03), coll))
    far = _make_obj('far', _join(far_parts, 'far_lod2'), coll)
    objs1 = [body1] + flaps1 + wheels1 + [far]
    mats1 = set()
    for o in objs1:
        mats1.update(o.data.materials)
    _strip_extra_maps(mats1, also_rough=hier)
    _resize_images(mats1, TEX_LOD1)
    bpy.context.view_layer.update()
    p1 = os.path.join(out_dir, f'{team}_lod1.glb')
    _export(objs1, p1)
    report['lod1_tris'] = sum(_tris(o.data) for o in [body1] + flaps1 + wheels1)
    report['lod2_tris'] = _tris(far.data)
    report['lod1_bytes'] = os.path.getsize(p1)

    mn, mx = _bbox([m for m in base.values() if '#' not in m.name])
    to3 = lambda v: [v[0], v[2], -v[1]]     # Blender car space -> three.js (x left, y up, z forward)
    meta = dict(
        team=team, source=cfg.get('source', {}),
        length=mx.y - mn.y, width=mx.x - mn.x, height=mx.z - mn.z,
        frontOverhang=-mn.y, rearOverhang=mx.y,
        wheelbase=frames['rl'].translation.y - frames['fl'].translation.y,
        trackFront=frames['fl'].translation.x - frames['fr'].translation.x,
        trackRear=frames['rl'].translation.x - frames['rr'].translation.x,
        wheelRadiusFront=radii['fl'], wheelRadiusRear=radii['rl'],
        tyreWidthFront=widths['fl'], tyreWidthRear=widths['rl'],
        camberDeg=cambers,
        wheels={k: to3(f.translation) for k, f in frames.items()},
        flaps={k: (to3(h.translation) if h else None) for k, h in hinges.items()},
        steer=(dict(centre=to3(steer_info['centre']), axis=to3(steer_info['axis'])) if steer_info else None),
        report=report,
    )
    with open(os.path.join(out_dir, f'{team}.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=1)
    return meta


def process_latest(team, out_dir, source, root_name=None):
    """Process an imported car (the only one in the scene, or root_name), then clear it."""
    if root_name is None:
        tops = [o for o in bpy.data.objects if o.parent is None and o.type == 'EMPTY' and any(c.type == 'MESH' for c in o.children_recursive)]
        if not tops:
            raise RuntimeError('no imported car found in the scene')
        root_name = tops[0].name
    print('root:', root_name)
    meta = process(dict(team=team, root=root_name, out_dir=out_dir, source=source))
    r = meta['report']
    summary = (f"{team}: wheelbase {meta['wheelbase']:.3f} lod0 {r['lod0_tris']} tris {r['lod0_bytes']//1024} KB, "
               f"lod1 {r['lod1_tris']} + far {r['lod2_tris']} tris {r['lod1_bytes']//1024} KB, flaps {meta['flaps']}")
    cleanup(team, root_name)
    print('SUMMARY', summary)
    return summary


def cleanup(team, root_name=None):
    """Remove the processed objects (and optionally the imported source) to keep Blender light."""
    coll = bpy.data.collections.get('car_' + team)
    if coll:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
    if root_name and root_name in bpy.data.objects:
        top = bpy.data.objects[root_name]
        while top.parent:
            top = top.parent
        for o in list(top.children_recursive) + [top]:
            bpy.data.objects.remove(o, do_unlink=True)
    for _ in range(3):
        for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
            for d in list(block):
                if d.users == 0:
                    block.remove(d)
