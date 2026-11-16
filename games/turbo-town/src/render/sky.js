// TURBO TOWN - bright gradient sky with a sun and puffy drifting clouds.
import * as THREE from 'three';

export function createSky({ top = '#4fb3ff', horizon = '#bfe9ff', bottom = '#e9f8ff', sun = '#fff7c2', clouds = 14, cloudColor = '#ffffff', seed = 3 } = {}) {
  const group = new THREE.Group();
  group.name = 'sky';
  const geo = new THREE.SphereGeometry(850, 24, 14);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) },
      bottom: { value: new THREE.Color(bottom) }, sunCol: { value: new THREE.Color(sun) },
      sunDir: { value: new THREE.Vector3(0.45, 0.5, 0.35).normalize() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.8)) : mix(horizon, bottom, min(1.0, -h * 4.0));
        float s = max(0.0, dot(normalize(vDir), sunDir)); c += sunCol * (pow(s, 600.0) * 1.2 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // clouds: clusters of flattened spheres, one instanced mesh
  let rs = seed;
  const r = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshLambertMaterial({ color: cloudColor, emissive: new THREE.Color(cloudColor).multiplyScalar(0.55), fog: false });
  const per = 5;
  const inst = new THREE.InstancedMesh(puff, cloudMat, clouds * per);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const cloudData = [];
  for (let c = 0; c < clouds; c++) {
    const ang = r() * Math.PI * 2, dist = 380 + r() * 260, hgt = 110 + r() * 120;
    const size = 16 + r() * 18;
    cloudData.push({ ang, dist, hgt, size, speed: (0.004 + r() * 0.006) * (r() < 0.5 ? 1 : -1) });
  }
  group.userData.update = (t) => {
    let i = 0;
    for (const cd of cloudData) {
      const a = cd.ang + t * cd.speed;
      const cx = Math.cos(a) * cd.dist, cz = Math.sin(a) * cd.dist;
      for (let k = 0; k < per; k++) {
        const ox = (k - 2) * cd.size * 0.55, oy = (k % 2) * cd.size * 0.18, sc = cd.size * (k === 2 ? 0.75 : 0.5);
        p.set(cx + ox * Math.cos(a + 1.57), cd.hgt + oy, cz + ox * Math.sin(a + 1.57));
        s.set(sc, sc * 0.62, sc);
        m.compose(p, q, s);
        inst.setMatrixAt(i++, m);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  group.userData.update(0);
  inst.frustumCulled = false;
  group.add(inst);
  group.userData.sunDir = mat.uniforms.sunDir.value;
  return group;
}
