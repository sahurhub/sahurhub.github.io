// Drift! - player settings, saved in this browser (localStorage "drift.settings").
import { store, save, Emitter } from './util.js';

export const ACTIONS = [
  ['throttle', 'Accelerate'], ['brake', 'Brake / reverse'], ['left', 'Steer left'], ['right', 'Steer right'],
  ['handbrake', 'Handbrake'], ['reset', 'Reset car'], ['camera', 'Change camera'], ['horn', 'Horn'],
  ['lights', 'Headlights'], ['indL', 'Left indicator'], ['indR', 'Right indicator'], ['hazard', 'Hazard lights'],
  ['lookBack', 'Look back (hold)'], ['freeLook', 'Free look (hold)'], ['gearUp', 'Gear up (manual)'], ['gearDown', 'Gear down (manual)'],
  ['map', 'Big map'], ['chat', 'Room chat'], ['players', 'Players panel'], ['pause', 'Pause menu'],
];

// Each action can have up to two keys (KeyboardEvent.code).
export const DEFAULT_KEYS = {
  throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'], reset: ['KeyR'], camera: ['KeyC'], horn: ['KeyH'],
  lights: ['KeyL'], indL: ['KeyZ'], indR: ['KeyX'], hazard: ['KeyB'],
  lookBack: ['ShiftLeft'], freeLook: ['KeyV'], gearUp: ['KeyE'], gearDown: ['KeyQ'],
  map: ['KeyM'], chat: ['Enter'], players: ['Tab'], pause: ['Escape'],
};

export const CAMERA_MODES = ['cockpit', 'close', 'far', 'hood'];
export const CAMERA_NAMES = { cockpit: 'Cockpit', close: 'Third person (close)', far: 'Third person (far)', hood: 'Hood' };

const DEFAULTS = {
  v: 1,
  quality: 'auto',      // auto | low | medium | high
  renderScale: 1,       // 0.5 - 1
  shadows: true,
  fps: false,
  autoQualityNotice: true,
  volume: 0.8, engineVolume: 0.8, effectsVolume: 0.9,
  units: 'mph',         // mph | kmh
  gearbox: 'auto',      // auto | manual
  camera: 'close',
  fov: 70,              // degrees (base, third person)
  camDistance: 1,       // multiplier for the chase cameras
  mouseSens: 1,
  nameTags: true,
  // drift assists (each on/off) and the drift angle meter
  assistCountersteer: true,
  assistAngleHold: true,
  assistThrottle: true,
  driftMeter: true,
  minimap: true,
  keys: DEFAULT_KEYS,
  car: '',
};

class Settings extends Emitter {
  constructor() {
    super();
    const saved = store('drift.settings', {});
    this.data = { ...DEFAULTS, ...saved, keys: { ...DEFAULT_KEYS, ...(saved && saved.keys) } };
  }
  get(k) { return this.data[k]; }
  set(k, v) {
    if (this.data[k] === v) return;
    this.data[k] = v;
    save('drift.settings', this.data);
    this.emit('change', k, v);
  }
  setKey(action, index, code) {
    const keys = { ...this.data.keys };
    // a key can only do one thing: take it away from other actions
    for (const a of Object.keys(keys)) keys[a] = keys[a].filter((c) => !(c === code && !(a === action)));
    const list = [...(keys[action] || [])];
    list[index] = code;
    keys[action] = list.filter(Boolean);
    this.set('keys', keys);
  }
  resetKeys() { this.set('keys', { ...DEFAULT_KEYS }); }
}

export const settings = new Settings();

export function keyName(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace' };
  return names[code] || code;
}
