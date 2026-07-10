// Exoplanet layer: a per-system explorer. Real NASA Exoplanet Archive systems
// rendered with the host star at the centre, planets on scaled orbits, the
// habitable zone shaded, and animated orbital motion.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { animatedCoronaMaterial, atmosphereMaterial } from "./shaders.js";
import { glowTexture } from "./solarsystem.js";
import { disposeObject3D } from "./scene-utils.js";

function starColor(teff) {
  if (!teff) return new THREE.Color("#ffd9a0");
  if (teff < 3500) return new THREE.Color("#ff8a5c");
  if (teff < 5000) return new THREE.Color("#ffc16b");
  if (teff < 6000) return new THREE.Color("#fff2c9");
  if (teff < 7500) return new THREE.Color("#eaf0ff");
  return new THREE.Color("#cdd8ff");
}
function label(text, cls) {
  const div = document.createElement("div");
  div.className = "label3d " + (cls || "");
  div.textContent = text;
  return new CSS2DObject(div);
}

export class ExoExplorer {
  constructor(data) {
    this.data = data;
    this.systems = data.systems;
    this.group = new THREE.Group();
    this.pickables = [];
    this.planets = [];
    this.index = 0;
    this.light = new THREE.PointLight(0xffffff, 3, 0, 0);
    this.group.add(this.light, new THREE.AmbientLight(0x223044, 0.7));
    this.buildSystem(0);
  }

  buildSystem(i) {
    this.index = i;
    // clear previous (keep lights)
    disposeObject3D(this.group);
    for (const child of [...this.group.children]) {
      if (child.isLight) continue;
      this.group.remove(child);
    }
    this.pickables = []; this.planets = []; this.hz = null;
    const sys = this.systems[i];

    // host star
    const sr = 0.9 + 0.5 * Math.log10((sys.st_rad_sun || 0.3) * 10 + 1);
    const star = new THREE.Mesh(new THREE.SphereGeometry(sr, 48, 48),
      new THREE.MeshBasicMaterial({ color: starColor(sys.st_teff) }));
    star.userData = { kind: "star", data: sys };
    const corona = new THREE.Mesh(new THREE.SphereGeometry(sr * 1.7, 48, 48),
      animatedCoronaMaterial("#" + starColor(sys.st_teff).getHexString()));
    this.coronaMat = corona.material;
    this.coronaMat.uniforms.uR.value = sr * 1.7;
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: starColor(sys.st_teff), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glare.scale.setScalar(sr * 6);
    this.group.add(star, corona, glare);
    this.pickables.push(star);
    const sl = label(sys.hostname, "sun"); sl.position.set(0, sr + 0.5, 0); star.add(sl);

    // scale: fit outermost orbit to a fixed scene radius
    const maxSMA = Math.max(...sys.planets.map(p => p.sma_au || 0.05), sys.hz_outer_au || 0.1);
    const scale = 13 / maxSMA;
    this.unitsPerAU = scale;   // for the scale readout

    // habitable zone annulus
    if (sys.hz_inner_au && sys.hz_outer_au) {
      const hz = new THREE.Mesh(
        new THREE.RingGeometry(sys.hz_inner_au * scale, sys.hz_outer_au * scale, 96),
        new THREE.MeshBasicMaterial({ color: 0x3fae6a, transparent: true, opacity: 0.16,
          side: THREE.DoubleSide, depthWrite: false }));
      hz.rotation.x = -Math.PI / 2;
      this.group.add(hz);
      this.hz = hz;
    }

    // planets + orbits
    sys.planets.forEach((p, k) => {
      const orbit = (p.sma_au || (0.03 * (k + 1))) * scale;
      const pr = THREE.MathUtils.clamp(0.16 + 0.2 * Math.sqrt(p.radius_earth || 1), 0.16, 1.3);
      const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85, metalness: 0.05,
        emissive: new THREE.Color(p.in_hz ? 0x123a22 : 0x000000) });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(pr, 36, 36), mat);
      mesh.userData = { kind: "planet", data: { ...p, host: sys.hostname } };
      // habitable-zone worlds get a soft blue atmosphere rim
      if (p.in_hz) mesh.add(new THREE.Mesh(new THREE.SphereGeometry(pr * 1.06, 32, 32),
        atmosphereMaterial("#7dd0ff", 0.45)));
      this.group.add(mesh);
      this.pickables.push(mesh);

      // orbit ring line
      const pts = [];
      for (let a = 0; a <= 128; a++) {
        const t = a / 128 * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * orbit, 0, Math.sin(t) * orbit));
      }
      this.group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: p.in_hz ? 0x4fae6a : 0x4a6fa5,
          transparent: true, opacity: p.in_hz ? 0.6 : 0.3 })));

      const pl = label(p.name.replace(sys.hostname, "").trim() || p.name, "planet");
      pl.position.set(0, pr + 0.35, 0); mesh.add(pl);

      this.planets.push({ mesh, orbit, period: p.period_days || (3 * (k + 1)), phase: k * 0.7, pr });
    });

    this.sceneRadius = 14;
  }

  update(jd) {
    for (const p of this.planets) {
      const a = (jd / (p.period || 5)) * 2 * Math.PI + p.phase;
      p.mesh.position.set(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit);
    }
  }

  tick(dt) {   // decorative motion, independent of the orbit toggle
    this._t = (this._t || 0) + dt;
    if (this.coronaMat) this.coronaMat.uniforms.uTime.value = this._t;
    for (const p of this.planets) p.mesh.rotation.y += dt * 0.35;
  }

  systemNames() { return this.systems.map(s => `${s.hostname} (${s.n_planets})`); }
}
