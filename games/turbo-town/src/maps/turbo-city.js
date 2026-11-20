// Turbo City: the look. The whole city is one Blender model (city.glb) cut into pieces (one
// per block, so blocks out of view are not drawn); street lamps, trees and traffic lights
// are drawn many times from one model each.
export const vis = {
  models: ['city.glb'],
  sky: { top: '#3fa9ff', horizon: '#cdeeff', bottom: '#f6fbff', sun: '#fff6c4', clouds: 14, seed: 52 },
  fog: { color: '#d6efff', near: 190 },
  light: { sky: '#eaf8ff', ground: '#c9c3e6', hemi: 1.3, sun: '#fff4dc', sunI: 1.55 },
};

export function decorate(ctx, kit) {
  const L = ctx.city;
  // the city itself (positions are already in the model)
  for (const name of L.pieces || []) kit.place(name, [{ x: 0, y: 0, z: 0 }]);
  // painted layers (road lines, park paths, pads): drawn pulled towards the camera so they
  // always show on top of the ground instead of flickering with it (layer 3 above 2 above 1)
  (L.marks || []).forEach((name, i) => {
    const grp = kit.place(name, [{ x: 0, y: 0, z: 0 }], { shadow: false });
    if (!grp) return;
    grp.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.polygonOffset = true;
      o.material.polygonOffsetFactor = -2 * (i + 1);
      o.material.polygonOffsetUnits = -4 * (i + 1);
      o.renderOrder = 1 + i;
    });
  });
  // street furniture (their collision comes from the layout's posts)
  const at = (list) => (list || []).map(([x, z, ry]) => ({ x, y: 0, z, ry: ry || 0 }));
  kit.place('city_lamp', at(L.lamps), { view: 220 });
  kit.place('city_tree', at(L.trees), { view: 260 });
  kit.place('city_lights', at(L.lights), { view: 220 });
  kit.place('city_hydrant', at(L.hydrants), { view: 120, shadow: false });
  kit.place('city_bench', at(L.benches), { view: 120, shadow: false });
  kit.place('cone', at(L.cones), { view: 160, shadow: false });
  return { update() {} };
}
