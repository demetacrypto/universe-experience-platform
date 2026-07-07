// Solar System scene (L0): textured planets, atmospheres, rings, moons,
// orbits, asteroid belt and labels. Positions from client-side Kepler solving
// of the JPL elements delivered by the backend, so time controls animate the
// real orbital motion.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { makePlanetTexture, makeSunTexture, makeRingTexture } from "./textures.js";
import { atmosphereMaterial, animatedCoronaMaterial, sunSurfaceMaterial } from "./shaders.js";
import { TEX, load as loadTex, hasReal } from "./realtex.js";

const J2000 = 2451545.0;
const DEG = Math.PI / 180;

// ---- scale (illustrative by default; toggleable) --------------------------
function sceneRadiusForAU(r, trueScale) {
  return trueScale ? r * 40 : 7 * Math.pow(r, 0.6);
}
function planetSceneRadius(km, trueScale) {
  if (trueScale) return Math.max(0.05, (km / 149597870.7) * 40 * 60); // exaggerate x60 even in "true"
  return Math.min(3.0, Math.max(0.18, 0.18 + 0.9 * Math.log10(km / 2000)));
}
function sunSceneRadius(trueScale) { return trueScale ? 6 : 3.2; }

// ecliptic (x,y in-plane, z out) -> three.js (y-up): plane = XZ
function eclToScene(x, y, z, trueScale) {
  const r = Math.sqrt(x * x + y * y + z * z) || 1e-9;
  const s = sceneRadiusForAU(r, trueScale) / r;
  return new THREE.Vector3(x * s, z * s, y * s);
}

export function planetPositionAU(el, jd) {
  const T = (jd - J2000) / 36525;
  const a = el.a + el.da * T, e = el.e + el.de * T, I = (el.I + el.dI * T) * DEG;
  const L = el.L + el.dL * T, peri = el.peri + el.dperi * T, node = el.node + el.dnode * T;
  let M = ((L - peri) % 360) * DEG;
  if (M > Math.PI) M -= 2 * Math.PI;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE; if (Math.abs(dE) < 1e-9) break;
  }
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (peri - node) * DEG, om = node * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(om), so = Math.sin(om),
        ci = Math.cos(I), si = Math.sin(I);
  return [
    (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    (sw * si) * xp + (cw * si) * yp,
  ];
}

// Soft radial glare texture for camera-facing halo sprites (shared by the
// solar, exoplanet, galaxy and black-hole layers).
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.0, "rgba(255,244,214,1)");
  g.addColorStop(0.12, "rgba(255,226,160,0.55)");
  g.addColorStop(0.35, "rgba(255,190,110,0.16)");
  g.addColorStop(0.7, "rgba(255,160,80,0.045)");
  g.addColorStop(1.0, "rgba(255,150,70,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  _glowTex = new THREE.CanvasTexture(cv);
  return _glowTex;
}

function label(text, cls) {
  const div = document.createElement("div");
  div.className = "label3d " + (cls || "");
  div.textContent = text;
  return new CSS2DObject(div);
}

// latitude/longitude on a sphere of radius r (aligned to equirectangular texture)
function latLonToVec3(lat, lon, r) {
  const phi = (90 - lat) * DEG, theta = (lon + 90) * DEG;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

export class SolarSystem {
  constructor(data) {
    this.data = data;
    this.group = new THREE.Group();
    this.trueScale = false;
    this.brightMode = false;
    this.planets = [];
    this.pickables = [];
    this.byName = {};
    this.landmarkMap = {};
    this._build();
  }

  _build() {
    const d = this.data;

    // --- Sun ---
    const sunR = sunSceneRadius(this.trueScale);
    const sunTex = TEX.Sun ? loadTex(TEX.Sun.map) : makeSunTexture(d.sun.palette);
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(sunR, 96, 96),
      sunSurfaceMaterial(sunTex)
    );
    this._sunMat = sun.material;
    sun.userData = { kind: "sun", data: { name: "Sun", facts: d.sun.facts, radius_km: d.sun.radius_km } };
    const corona = new THREE.Mesh(new THREE.SphereGeometry(sunR * 1.6, 48, 48),
      animatedCoronaMaterial("#ffcf6b"));
    this._corona = corona.material;
    this._corona.uniforms.uR.value = sunR * 1.6;
    this._t = 0;
    // camera-facing glare halo — reads as real lens glow at any distance
    const glare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffe9c0, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true }));
    glare.scale.setScalar(sunR * 5);
    glare.renderOrder = -1;
    this.group.add(sun, corona, glare);
    this._glare = glare;

    // slow-orbiting, pulsing flare eruptions at the rim — the Sun feels alive
    this._flares = [];
    for (let i = 0; i < 4; i++) {
      const fs = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xffb45e, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false }));
      this.group.add(fs);
      this._flares.push({ s: fs, a: Math.random() * Math.PI * 2,
        sp: 0.05 + Math.random() * 0.08, ph: Math.random() * 6.28,
        y: (Math.random() - 0.5) * 0.5, r: sunR * (1.04 + Math.random() * 0.1) });
    }
    this._sunR = sunR;
    this.sunMesh = sun;
    this.pickables.push(sun);
    const sunLabel = label("Sun", "sun");
    sunLabel.position.set(0, sunR + 0.6, 0);
    sun.add(sunLabel);

    // point light from the Sun + ambient fill (boosted in "bright lighting" mode)
    this.sunLight = new THREE.PointLight(0xfff2d0, 3.0, 0, 0.0);
    this.ambient = new THREE.AmbientLight(0x223044, 0.6);
    this.fill = new THREE.HemisphereLight(0xbcd0ff, 0x202830, 0.0);  // even sky/ground fill
    this.group.add(this.sunLight, this.ambient, this.fill);
    this._applyLighting();

    // --- Planets ---
    for (const p of d.planets) {
      const g = new THREE.Group();
      const pr = planetSceneRadius(p.radius_km, this.trueScale);

      const gassy = (p.type === "gas_giant" || p.type === "ice_giant");
      let mat;
      const tx = TEX[p.name];
      if (tx) {
        // real NASA-derived texture
        mat = new THREE.MeshStandardMaterial({
          map: loadTex(tx.map), roughness: gassy ? 1.0 : 0.92, metalness: 0.0 });
        if (tx.bump) { mat.bumpMap = loadTex(tx.bump, { srgb: false }); mat.bumpScale = 0.04; }
        if (tx.normal) { mat.normalMap = loadTex(tx.normal, { srgb: false }); mat.normalScale = new THREE.Vector2(0.8, 0.8); }
        if (tx.specular) { mat.roughnessMap = loadTex(tx.specular, { srgb: false }); mat.metalness = 0.15; }
        if (tx.lights) { mat.emissiveMap = loadTex(tx.lights); mat.emissive = new THREE.Color(0xffd27f); mat.emissiveIntensity = 1.1; }
      } else {
        const { map, bump } = makePlanetTexture(p.name, p.type, p.palette, p.name.length * 13 + 1);
        mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.05, roughness: 0.95, metalness: 0.02 });
      }
      const surf = new THREE.Mesh(new THREE.SphereGeometry(pr, 96, 96), mat);
      surf.rotation.z = (p.tilt_deg || 0) * DEG;
      surf.userData = { kind: "planet", data: p };
      g.add(surf);
      this.pickables.push(surf);
      if (p.landmarks && p.landmarks.length) this.landmarkMap[p.name] = this._addLandmarks(surf, pr, p.landmarks);

      // Earth: real cloud shell
      if (tx && tx.clouds) {
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(pr * 1.015, 64, 64),
          new THREE.MeshStandardMaterial({ map: loadTex(tx.clouds), transparent: true, opacity: 0.85,
            alphaMap: loadTex(tx.clouds, { srgb: false }), depthWrite: false, roughness: 1 }));
        g.add(clouds);
        this._earthClouds = clouds;
      }

      // atmosphere halo
      if (p.atmosphere) {
        const atm = new THREE.Mesh(new THREE.SphereGeometry(pr * 1.025, 64, 64),
          atmosphereMaterial(p.atmosphere, 0.55));
        g.add(atm);
      }

      // rings
      if (p.rings) {
        const ringTex = (tx && tx.ring) ? loadTex(tx.ring) : makeRingTexture(p.rings, p.name.length + 2);
        const inner = pr * p.rings.inner, outer = pr * p.rings.outer;
        const rg = new THREE.RingGeometry(inner, outer, 96, 1);
        // radial UVs so the 1-D ring texture is sampled across the ring width
        const pos = rg.attributes.position, uv = rg.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const rr = Math.sqrt(pos.getX(i) ** 2 + pos.getY(i) ** 2);
          uv.setXY(i, (rr - inner) / (outer - inner), 0.5);
        }
        const ringMat = new THREE.MeshBasicMaterial({
          map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
        });
        if (tx && tx.ring) { ringMat.alphaMap = ringTex; ringMat.opacity = 0.95; } // jpg has no alpha
        const ring = new THREE.Mesh(rg, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.rotation.y = (p.tilt_deg || 0) * DEG;
        g.add(ring);
      }

      // moons
      const moons = [];
      p.moons.forEach((m, i) => {
        const mr = Math.max(0.05, planetSceneRadius(m.radius_km, this.trueScale) * 0.5);
        const moonMat = (m.name === "Moon" && TEX.Moon)
          ? new THREE.MeshStandardMaterial({ map: loadTex(TEX.Moon.map), roughness: 1 })
          : new THREE.MeshStandardMaterial({ color: m.color, roughness: 1 });
        const mm = new THREE.Mesh(new THREE.SphereGeometry(mr, 32, 32), moonMat);
        mm.userData = { kind: "moon", data: { ...m, parent: p.name }, sceneR: mr };
        // larger invisible click target so small, fast moons are easy to select
        const moonPick = new THREE.Mesh(new THREE.SphereGeometry(Math.max(mr * 3, 0.4), 10, 10),
          new THREE.MeshBasicMaterial({ visible: false }));
        moonPick.userData = mm.userData;
        mm.add(moonPick);
        const orbit = pr + 0.6 + i * 0.55;
        g.add(mm);
        this.pickables.push(moonPick);
        if (m.landmarks && m.landmarks.length) this.landmarkMap[m.name] = this._addLandmarks(mm, mr, m.landmarks);
        moons.push({ mesh: mm, orbit, period: m.period_days || 5, phase: i * 1.3 });
      });

      // orbit line
      const pts = [];
      for (let k = 0; k <= 256; k++) {
        const jd = J2000 + (k / 256) * (p.elements.L < 0 ? -365 : 365) * 50; // sweep enough to close
        const [x, y, z] = planetPositionAU(p.elements, J2000 + (k / 256) * 365.25 * (p.distance_au ** 1.5));
        pts.push(eclToScene(x, y, z, this.trueScale));
      }
      const orbitLine = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x4a6fa5, transparent: true, opacity: 0.35 })
      );
      this.group.add(orbitLine);

      const lab = label(p.name, "planet");
      lab.position.set(0, pr + 0.5, 0);
      surf.add(lab);

      this.group.add(g);
      const rec = { name: p.name, group: g, surf, moons, data: p, sceneR: pr, orbitLine };
      this.planets.push(rec);
      this.byName[p.name] = rec;
    }

    // --- asteroid belt ---
    const belt = d.asteroid_belt;
    const bn = belt.count, bp = new Float32Array(bn * 3);
    for (let i = 0; i < bn; i++) {
      const au = belt.inner_au + Math.random() * (belt.outer_au - belt.inner_au);
      const ang = Math.random() * Math.PI * 2;
      const incl = (Math.random() - 0.5) * 0.15;
      const v = eclToScene(au * Math.cos(ang), au * Math.sin(ang), au * incl, this.trueScale);
      bp[i * 3] = v.x; bp[i * 3 + 1] = v.y; bp[i * 3 + 2] = v.z;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(bp, 3));
    this.belt = new THREE.Points(bg, new THREE.PointsMaterial({
      color: belt.color, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.7,
    }));
    this.group.add(this.belt);
  }

  _addLandmarks(parentMesh, r, landmarks) {
    const group = new THREE.Group();
    group.visible = false;                 // shown only in surface view
    parentMesh.add(group);
    for (const lm of landmarks) {
      const v = latLonToVec3(lm.lat, lm.lon, r * 1.004);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(r * 0.018, 0.012), 10, 10),
        new THREE.MeshBasicMaterial({ color: 0x6cf0ff }));
      dot.position.copy(v);
      dot.userData = { kind: "landmark", data: lm };
      group.add(dot);
      this.pickables.push(dot);
      const div = document.createElement("div");
      div.className = "label3d landmark"; div.textContent = lm.name;
      const lbl = new CSS2DObject(div); lbl.position.set(0, Math.max(r * 0.05, 0.04), 0);
      lbl.visible = false;            // CSS2DRenderer checks only the object's OWN visible flag
      dot.add(lbl);
    }
    return group;
  }

  showLandmarksFor(name) {            // reveal one body's landmarks, hide the rest
    for (const k in this.landmarkMap) {
      const g = this.landmarkMap[k], on = (k === name);
      g.visible = on;
      // CSS2DRenderer ignores ancestor visibility, so toggle each label directly
      g.traverse((o) => { if (o.element) o.visible = on; });
    }
  }

  _applyLighting() {
    if (!this.ambient) return;
    if (this.brightMode) {        // even fill — see the whole planet, without washing out
      this.ambient.color.set(0x9aa6b8); this.ambient.intensity = 0.9;
      this.fill.intensity = 0.75; this.sunLight.intensity = 2.4;
    } else {                       // realistic — only the Sun lights the planets
      this.ambient.color.set(0x223044); this.ambient.intensity = 0.6;
      this.fill.intensity = 0.0; this.sunLight.intensity = 3.0;
    }
  }
  setBrightMode(on) { this.brightMode = on; this._applyLighting(); }

  setTrueScale(on) {
    if (on === this.trueScale) return;
    this.trueScale = on;
    // simplest correct approach: rebuild the scene graph
    const parent = this.group.parent;
    this.group.removeFromParent();
    this.group = new THREE.Group();
    this.planets = []; this.pickables = []; this.byName = {};
    this._build();
    if (parent) parent.add(this.group);
  }

  update(jd, dt = 0, cam = null) {
    // living Sun: boiling corona + pulsing rim flares (dt=0 under reduced motion)
    this._t += dt;
    // glare fades as the camera approaches — close-ups show the real surface
    if (cam && this._glare) {
      const cd = cam.position.length(), r = this._sunR;
      this._glare.material.opacity =
        0.55 * THREE.MathUtils.clamp((cd - r * 2.0) / (r * 3.5), 0, 1);
    }
    if (this._corona) this._corona.uniforms.uTime.value = this._t;
    if (this._sunMat) this._sunMat.uniforms.uTime.value = this._t;
    if (this._flares) for (const fl of this._flares) {
      fl.a += dt * fl.sp;
      const rise = 0.85 + 0.3 * Math.sin(this._t * 1.1 + fl.ph);   // breathe outward
      fl.s.position.set(Math.cos(fl.a) * fl.r * rise, fl.y * this._sunR * 0.6,
        Math.sin(fl.a) * fl.r * rise);
      fl.s.scale.setScalar(this._sunR * (0.8 + 0.35 * Math.sin(this._t * 1.4 + fl.ph)));
      fl.s.material.opacity = 0.2 + 0.16 * (1 + Math.sin(this._t * 0.9 + fl.ph * 2));
    }
    if (this._earthClouds) this._earthClouds.rotation.y = (jd * 0.35) % (Math.PI * 2);
    for (const rec of this.planets) {
      const [x, y, z] = planetPositionAU(rec.data.elements, jd);
      rec.group.position.copy(eclToScene(x, y, z, this.trueScale));
      rec.worldPos = rec.group.position.clone();
      // axial spin
      const spin = (24 / (Math.abs(rec.data.rotation_h) || 24)) * (rec.data.rotation_h < 0 ? -1 : 1);
      rec.surf.rotation.y = (jd * spin * 0.5) % (Math.PI * 2);
      // moons
      for (const mo of rec.moons) {
        const a = jd / (mo.period || 5) * 2 * Math.PI + mo.phase;
        mo.mesh.position.set(Math.cos(a) * mo.orbit, Math.sin(a) * 0.12, Math.sin(a) * mo.orbit);
      }
    }
  }

  flyTarget(name) {
    const rec = this.byName[name];
    if (rec) return { position: rec.worldPos || rec.group.position, radius: rec.sceneR };
    if (name === "Sun") return { position: new THREE.Vector3(0, 0, 0), radius: sunSceneRadius(this.trueScale) };
    return null;
  }
}
