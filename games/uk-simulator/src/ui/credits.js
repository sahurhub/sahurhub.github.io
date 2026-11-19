// UK Simulator - credits: map data, LiDAR, textures, libraries and every Sketchfab model used.
import { TEXTURES } from '../shared/textures.js';
import { modelCredits } from '../vehicles/models.js';
import { escapeHtml as esc } from './hud.js';

export function creditsHtml() {
  const models = modelCredits();
  const tex = [...new Set(TEXTURES.map((t) => t.src))].sort().join(', ');
  return `<h2>Map and terrain data</h2><ul class="credits">
    <li><b>&copy; OpenStreetMap contributors</b> - roads, street names, buildings, land use, rivers, the canal, railways, paths, shops. Open Database Licence (openstreetmap.org/copyright). Extracts by Geofabrik GmbH.</li>
    <li><b>&copy; Environment Agency copyright and/or database right 2022. All rights reserved</b> - LIDAR Composite DTM and First Return DSM 2022 (1 m), used for the ground, building heights and tree positions. Open Government Licence.</li>
    <li>Satellite or aerial photos: not used. No free source clearly allowed them in a public opsec, so the ground uses textures chosen from the map data.</li>
  </ul>
  <h2>Textures</h2><ul class="credits"><li><b>ambientCG.com</b> (Lennart Demes and contributors), CC0 1.0 - ${esc(tex)}.</li></ul>
  <h2>Vehicle models</h2><ul class="credits">${models.length ? models.map((m) => `<li><b>${esc(m.title)}</b> by ${esc(m.author)}${m.url ? ` (${esc(m.url)})` : ''} - ${esc(m.licence)}${m.changes ? '. ' + esc(m.changes) : ''}</li>`).join('') : '<li>Simple placeholder shapes made for this opsec (real models coming soon).</li>'}</ul>
  <h2>Software</h2><ul class="credits">
    <li><b>three.js</b> (MIT) - 3D graphics. <b>Rapier</b> by Dimforge (Apache 2.0) - physics engine. <b>earcut</b> by Mapbox (ISC). <b>geotiff.js</b> (MIT, used to read the LiDAR when building the town).</li>
  </ul>
  <h2>Real vehicles</h2><ul class="credits"><li>Ford, Porsche, Toyota, Yamaha, Honda and Kukirin names are used to describe the real vehicles whose published specs the physics is tuned to. This opsec is not connected to or endorsed by them.</li></ul>
  <p>Made for SahurHub.</p>`;
}
