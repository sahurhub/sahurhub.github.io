// Session snapshots. The game uses these today to save where you were (on foot or in which
// vehicle) and to put you back there after a reload. They are plain JSON with no three.js
// objects, which is the same shape a multiplayer server would need to send player states to
// other clients. There is no networking code in this build: multiplayer is not implemented.

export const SNAPSHOT_VERSION = 1;

export function snapshotSession(game) {
  const p = game.player;
  return {
    v: SNAPSHOT_VERSION,
    t: Date.now(),
    player: p.snapshot(),
    vehicle: game.vehicle ? game.vehicle.snapshot() : null,
    riding: !!p.vehicle,
  };
}

export function validSnapshot(s) {
  return !!(s && s.v === SNAPSHOT_VERSION && s.player && Number.isFinite(s.player.x) && Number.isFinite(s.player.z));
}

// apply to a game whose world, player and equipped vehicle already exist
export function restoreSession(game, s) {
  if (!validSnapshot(s)) return false;
  const half = 600;
  const inside = (x, z) => Math.abs(x) < half && Math.abs(z) < half && game.isAccessible(x, z);
  if (!inside(s.player.x, s.player.z)) return false;
  if (s.vehicle && game.vehicle && s.vehicle.id === game.vehicle.def.id && inside(s.vehicle.x, s.vehicle.z)) {
    game.vehicle.place(s.vehicle.x, s.vehicle.z, s.vehicle.h);
    if (s.riding) {
      game.player.place(s.vehicle.x, s.vehicle.z, s.vehicle.h);
      game.enterVehicle(true);
      return true;
    }
  }
  game.player.place(s.player.x, s.player.z, s.player.h);
  return true;
}
