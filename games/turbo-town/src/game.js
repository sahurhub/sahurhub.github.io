// TURBO TOWN - game core: owns the renderer, input, camera, particles and HUD, loads a
// map (only the selected one), runs races with a fixed physics step and draws frames.
import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { createSky } from './render/sky.js';
import { Particles } from './render/particles.js';
import { SkidMarks } from './render/skids.js';
import { PropKit } from './render/props.js';
import { Input } from './core/input.js';
import { makeRng } from './core/noise.js';
import { ChaseCamera } from './camera/chase-camera.js';
import { buildTrack, pointAt } from './shared/track-math.js';
import { KART_BY_ID } from './shared/karts.js';
import { loadMap } from './maps/index.js';
import { buildTrackWorld } from './maps/track-builder.js';
import { KartVisual } from './karts/kart-visual.js';
import { kartEffects, kartEventFx } from './karts/kart-effects.js';
import { Race } from './race/race.js';
import { Hud, ordinal, fmtTime } from './ui/hud.js';
import { ItemVisuals } from './items/item-visuals.js';
import { Sfx } from './audio/audio.js';
import { ITEMS } from './shared/items.js';
import { PHYSICS_DT, FLAGS } from './config.js';

// words for the hit messages: [what you hit them with, what happened to you]
const HIT_WORDS = {
  rocket: ['a Target Rocket', 'rocketed'],
  sticky: ['Sticky Splash', 'splashed'],
  freeze: ['a Freeze Pop', 'frozen'],
  rainbow: ['Rainbow Rush', 'bowled over'],
};

export class Game {
  constructor({ container, hudRoot, settings, assets }) {
    this.settings = settings;
    this.assets = assets || null;
    this.r = new Renderer(container, settings);
    this.input = new Input();
    this.cam = new ChaseCamera(this.r.camera);
    this.fx = new Particles(this.r.scene, 1600);
    this.skids = new SkidMarks(this.r.scene);
    this.sfx = new Sfx(settings);
    this.hud = new Hud(hudRoot);
    this.hud.show(false);
    this.acc = 0;
    this.time = 0;
    this.map = null;
    this.race = null;
    this.paused = false;
    this.fpsAcc = { t: 0, n: 0, fps: 0 };
    this.listeners = {};
    this.applySettings(settings);
    addEventListener('resize', () => this.fx.setViewport(innerHeight));
    this.fx.setViewport(innerHeight);
  }

  on(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, data) { for (const fn of this.listeners[type] || []) fn(data); }

  applySettings(s) {
    this.settings = s;
    this.r.applySettings(s);
    if (this.sfx) this.sfx.apply(s);
    this.fx.scale = this.r.quality.particles * (s.particles === 'low' ? 0.5 : s.particles === 'off' ? 0 : 1);
  }

  // ---------------------------------------------------------------- map

  async loadMap(id) {
    if (this.map && this.map.id === id) return this.map;
    this.unloadMap();
    const { def, vis, decorate } = await loadMap(id);
    // this map's own scenery models (only the selected map is downloaded)
    if (this.assets && vis.models) await this.assets.loadAll(vis.models);
    const track = buildTrack(def);
    const ctx = buildTrackWorld(track, vis);
    const scene = this.r.scene;
    const root = new THREE.Group();
    root.name = 'map_' + id;
    root.add(ctx.group);
    const sky = createSky(vis.sky);
    root.add(sky);
    scene.add(root);
    const L = vis.light || {};
    this.r.hemi.color.set(L.sky || '#e6f6ff');
    this.r.hemi.groundColor.set(L.ground || '#9ee07a');
    this.r.hemi.intensity = L.hemi ?? 1.25;
    this.r.sun.color.set(L.sun || '#fff1d6');
    this.r.sun.intensity = L.sunI ?? 1.5;
    this.r.setFog(vis.fog?.color || '#cdeeff', vis.fog?.near ?? 160);
    const kit = new PropKit(ctx.group, this.assets, ctx.world, this.r.quality);
    const scenery = decorate(ctx, kit, makeRng(7)) || {};
    this.map = { id, def, vis, track, ctx, root, sky, scenery, kit, world: ctx.world };
    return this.map;
  }

  unloadMap() {
    if (!this.map) return;
    this.map.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.map.root.removeFromParent();
    this.map = null;
  }

  // ---------------------------------------------------------------- race

  // opts: { map, laps, racers: [{ kart, name, isPlayer, driver, controller }] }
  async startRace(opts) {
    this.endRace(); // the old race must stop before its map goes away
    const map = await this.loadMap(opts.map);
    const racers = opts.racers.map((r) => ({ ...r, def: KART_BY_ID[r.kart] || KART_BY_ID.starter }));
    for (const r of racers) if (r.isPlayer && !r.controller) r.controller = this.playerController();
    const race = new Race({ track: map.track, world: map.world, grid: map.ctx.grid, laps: opts.laps || map.def.laps || 3, racers, countdown: opts.countdown, items: opts.items });
    this.race = race;
    this.itemVis = race.items ? new ItemVisuals(this, race) : null;
    this.visuals = race.racers.map((r) => {
      // the contact shadow stays on even with real shadows, so karts sit on the road
      const v = new KartVisual(r.def, { assets: this.assets, paint: r.data.paint, blob: true, cosmetics: r.data.cosmetics, boost: r.data.boost });
      this.r.scene.add(v.root);
      v.update(r.kart, 1, 0);
      return v;
    });
    this.colors = race.racers.map((r) => r.data.paint ? r.data.paint[0] : r.def.colors[0]);
    this.hud.setupMap(map.track);
    this.view = 'race';
    this.hud.show(true);
    this.hud.lastPlace = 0;
    this.cam.snap();
    this.acc = 0;
    this.paused = false;
    this.emit('raceStart', race);
    return race;
  }

  endRace() {
    if (this.visuals) for (const v of this.visuals) v.dispose();
    if (this.ghost) { this.ghost.dispose(); this.ghost = null; }
    if (this.itemVis) { this.itemVis.dispose(); this.itemVis = null; }
    this.visuals = null;
    this.race = null;
    this.intro = null;
    this.fx.clear();
    this.skids.clear();
    this.hud.show(false);
    this.hud.el.laps.innerHTML = '';
  }

  playerController() {
    // (drifting is worked out by the physics from the steering, see autoDrift)
    return (r) => {
      const s = this.input.poll();
      const ki = r.kart.input;
      if (r.finished) { ki.throttle = 0.4; ki.steer = 0; ki.back = false; return; }
      ki.throttle = s.throttle; ki.steer = s.steer; ki.item = s.item; ki.back = s.back;
    };
  }

  // ---------------------------------------------------------------- frame

  frame(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (this.view === 'showroom' && this.showroom) {
      this.sfx.stopKart();
      this.showroom.update(dt, this.r.camera.aspect);
      this.r.renderer.render(this.showroom.scene, this.showroom.camera);
      this.countFps(dt);
      return;
    }
    const race = this.race;
    if (this.intro) {
      this.intro.t += dt;
      if (this.intro.t >= this.intro.d) { this.intro = null; this.emit('introDone'); }
    }
    if (race && this.map && !this.paused && !this.intro) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= PHYSICS_DT && steps < 5) {
        race.step(PHYSICS_DT);
        this.acc -= PHYSICS_DT;
        steps++;
      }
      if (steps === 5) this.acc = 0;
    }
    const alpha = race && !this.paused ? this.acc / PHYSICS_DT : 1;
    if (this.map) {
      this.map.ctx.update(dt, this.time);
      if (this.map.scenery.update) this.map.scenery.update(dt, this.time, this);
    }
    if (race && this.map) this.drawRace(race, alpha, dt);
    if (this.map) {
      this.map.sky.position.copy(this.r.camera.position);
      this.map.sky.userData.update(this.time);
      this.map.kit.update(this.r.camera.position, this.r.viewDistance);
    }
    this.fx.update(this.paused ? 0 : dt);
    this.r.render();
    this.countFps(dt);
  }

  drawRace(race, alpha, dt) {
    const player = race.player;
    race.racers.forEach((r, i) => {
      const v = this.visuals[i];
      v.update(r.kart, alpha, dt);
      if (!this.paused) {
        const near = !player || r === player || Math.hypot(r.kart.x - player.kart.x, r.kart.z - player.kart.z) < 60;
        kartEffects(r.kart, v, this.fx, dt, near, this.skids);
        for (const e of r.kart.events) kartEventFx(e, r.kart, v, this.fx, this.cam, r === player);
        if (r === player) for (const e of r.kart.events) { this.emit('kartEvent', e); this.kartSound(e); }
      }
      r.kart.events.length = 0;
    });
    for (const e of race.takeEvents()) { if (this.itemVis) this.itemVis.onEvent(e); this.onRaceEvent(e); }
    if (this.itemVis && !this.paused) this.itemVis.update(dt);
    // the camera follows the player, or a chosen racer when spectating
    const focus = player || race.racers[this.focus || 0];
    if (focus) {
      const v = this.visuals[focus.index];
      const k = focus.kart;
      this.cam.update({ x: v.x, y: v.y, z: v.z, yaw: v.yaw, speed: k.speed, top: k.p.top, boost: k.boostT > 0, drift: k.driftVis, back: k.input.back && !player?.finished, air: !k.grounded }, dt, this.map.ctx.groundAt);
      if (this.intro) this.introCamera(v);
      this.r.follow(v.x, v.y, v.z);
      if (player && !this.intro) {
        this.hud.update(race, player, dt, this.colors);
        this.hud.tags(race, player, this.visuals, this.r.camera);
      }
    }
    if (player) {
      this.sfx.updateKart(player.kart, dt, !this.paused && !this.intro);
      if (player.roulette > 0 && Math.floor(player.roulette * 14) !== this._rouTick) { this._rouTick = Math.floor(player.roulette * 14); this.sfx.play('roulette'); }
    }
    if (this.ghost) this.ghost.update(race.state === 'countdown' ? 0 : race.time);
    if (this.recorder && player && race.state !== 'countdown' && !player.finished) this.recorder.sample(race.time, player.kart);
  }

  // Race intro: the camera sweeps down from high over the track onto the grid.
  startIntro(seconds = 3.2) {
    this.intro = { t: 0, d: seconds };
    this.hud.show(false);
  }
  skipIntro() { if (this.intro) this.intro.t = this.intro.d; }

  introCamera(v) {
    const f = Math.min(1, this.intro.t / this.intro.d);
    const e = f * f * (3 - 2 * f);
    const track = this.map.track;
    const a = pointAt(track.main, track.length * (0.82 + 0.16 * e));
    const sx = a.x - a.rx * 40 * (1 - e), sz = a.z - a.rz * 40 * (1 - e), sy = a.y + 45 * (1 - e) + 6;
    const cam = this.r.camera;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z; // chase camera spot
    cam.position.set(sx + (cx - sx) * e * e, sy + (cy - sy) * e * e, sz + (cz - sz) * e * e);
    cam.lookAt(v.x + (a.x - v.x) * (1 - e) * 0.3, v.y + 1, v.z + (a.z - v.z) * (1 - e) * 0.3);
    if (f >= 1) this.hud.show(true);
  }

  setView(view) {
    this.view = view;
    this.hud.show(view === 'race' && !!this.race && !this.intro);
  }

  kartSound(e) {
    const map = { hop: 'hop', land: 'land', wall: 'wall', bonk: 'bonk', bump: 'bump', driftTier: 'tier', miniTurbo: 'turbo', boostPad: 'boostPad', trickBoost: 'trick', splash: 'splash', fall: 'fall', rescue: 'rescue', spin: 'spin' };
    if (map[e.type]) this.sfx.play(map[e.type], e.v);
  }

  raceSound(e) {
    const me = this.race && this.race.player;
    const mine = e.racer && e.racer === me;
    const s = this.sfx;
    switch (e.type) {
      case 'count': s.play('count'); break;
      case 'go': s.play('go'); break;
      case 'lap': if (mine) s.play('lap'); break;
      case 'finalLap': if (mine) s.play('finalLap'); break;
      case 'finish': if (mine) s.play(e.place === 1 ? 'win' : 'finish'); break;
      case 'overtake': if (mine) s.play('overtake'); break;
      case 'boxHit': if (mine) s.play('box'); break;
      case 'itemGot': if (mine) s.play('itemGot'); break;
      case 'itemUse': if (mine) s.play(e.item === 'sticky' ? 'sticky' : e.item); break;
      case 'itemHit': if (mine) s.play(e.kind === 'rocket' ? 'boom' : 'spin'); break;
      case 'shieldPop': if (mine) s.play('shieldPop'); break;
      case 'frozen': if (mine) s.play('frozen'); break;
      case 'mystery': if (mine) s.play('mystery'); break;
      case 'rocketBoom': if (me && Math.hypot(e.x - me.kart.x, e.z - me.kart.z) < 40) s.play('boom'); break;
      default: break;
    }
  }

  onRaceEvent(e) {
    const me = this.race && this.race.player;
    this.raceSound(e);
    switch (e.type) {
      case 'go': this.hud.banner('GO!', 'go', 1.0); break;
      case 'startBoost': if (e.racer === me) this.hud.toast('Rocket start!', 'good'); break;
      case 'stall': if (e.racer === me) this.hud.toast('Too early!', 'bad'); break;
      case 'finalLap': if (e.racer === me) this.hud.banner('FINAL LAP!', 'final', 2); break;
      case 'lap': if (e.racer === me) this.hud.lapList(me); break;
      case 'overtake': if (e.racer === me) this.hud.toast('Overtake! +5 coins', 'coin'); break;
      case 'itemHit': case 'frozen': {
        // "You hit X with Y" / "You were Y by X" at the top of the screen
        const kind = e.type === 'frozen' ? 'freeze' : e.kind;
        const by = e.by && e.by !== e.racer ? e.by : null;
        if (e.racer === me) {
          if (e.type === 'itemHit') this.cam.bump(0.6);
          this.hud.notice(by ? `You were ${HIT_WORDS[kind]?.[1] || 'hit'} by ${by.name}` : e.type === 'frozen' ? 'Brrr! You were frozen' : 'You were hit!', 'bad');
        } else if (by && by === me) {
          this.hud.notice(`You hit ${e.racer.name} with ${HIT_WORDS[kind]?.[0] || 'an item'}`, 'good');
        }
        break;
      }
      case 'shieldPop':
        if (e.racer === me) this.hud.notice(e.by && e.by !== me ? `Your shield blocked ${e.by.name}'s ${HIT_WORDS[e.kind]?.[0] || 'item'}` : 'Your shield saved you!', 'good');
        else if (e.by && e.by === me) this.hud.notice(`${e.racer.name}'s shield blocked your ${HIT_WORDS[e.kind]?.[0] || 'item'}`, '');
        break;
      case 'hitBlocked':
        if (e.by && e.by === me && e.racer !== me) this.hud.notice(`${e.racer.name} dodged your ${HIT_WORDS[e.kind]?.[0] || 'item'} with Rainbow Rush`, '');
        break;
      case 'mystery':
        if (e.racer === me) this.hud.toast({ rainbow: 'Rainbow Rush!', bubbleBoost: 'Bubble Boost!', tripleBurst: 'Triple Burst!', snowGlobe: 'Snow Globe! Everyone else slows down' }[e.effect] || ITEMS.mystery.name, 'good');
        else if (e.effect === 'snowGlobe' && me && !me.finished) this.hud.notice(`You were slowed by ${e.racer.name}'s Snow Globe`, 'bad');
        break;
      case 'itemFizzle': if (e.racer === me) this.hud.toast('Nobody close enough to freeze', ''); break;
      case 'finish':
        if (e.racer === me) this.hud.banner(ordinal(e.place) + '!', 'finish', 3.5);
        break;
      default: break;
    }
    this.emit('raceEvent', e);
  }

  countFps(dt) {
    const f = this.fpsAcc;
    f.t += dt; f.n++;
    if (f.t >= 0.5) { f.fps = f.n / f.t; f.t = 0; f.n = 0; }
    const show = FLAGS.fps || this.settings.showFps;
    this.hud.fps(show ? Math.round(f.fps) + ' FPS' : null);
    // slow-device watch: if races run below ~36 FPS, the menu offers Low graphics once
    const race = this.race;
    if (race && race.state === 'racing' && !this.paused && !this.intro && !document.hidden && !FLAGS.test
      && this.settings.quality !== 'low' && !this.settings.lowAsked) {
      const w = this.slowWatch || (this.slowWatch = { t: 0, n: 0 });
      w.t += dt; w.n++;
      if (w.t >= 15) {
        const avg = w.n / w.t;
        if (avg < 36) this.slowSeen = Math.round(avg);
        w.t = 0; w.n = 0;
      }
    }
  }

  // ---------------------------------------------------------------- loop

  start() {
    let last = performance.now();
    const tick = (now) => {
      // ask for the next frame first: an error in one frame must never freeze the game
      this.raf = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      try {
        this.frame(dt);
        if (this.onFrame) this.onFrame(Math.min(dt, 0.1));
      } catch (e) {
        if (!this.loggedError) { this.loggedError = true; console.error('[frame]', e); }
      }
    };
    this.raf = requestAnimationFrame(tick);
  }
}

export { fmtTime };
