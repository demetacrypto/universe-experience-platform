// Resolved-galaxy layer (L3): procedural models of famous galaxies matched to
// their observed morphology. Two modes: a single-galaxy explorer, and a "field"
// view showing all galaxies together in 3-D. Published black-hole detections
// may carry a central marker; non-detections and upper limits never do.
// Distances, sizes, star counts and central masses are heterogeneous literature
// estimates; the star distribution and 3-D arrangement are procedural priors.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { glowTexture } from "./solarsystem.js";
import { disposeObject3D } from "./scene-utils.js";

const R = 34;                 // disk scene radius (single mode)
const TWO_PI = Math.PI * 2;
// aesthetic 3-D layout for the field view (scene units)
const FIELD_POS = [
  [0, 0, 0], [-58, 10, -22], [-74, -12, 14], [62, 16, -34],
  [42, -22, 44], [-32, 26, 58], [78, -6, 26],
];

export function centralBlackHoleIsUpperLimit(blackHole) {
  if (!blackHole) return false;
  const status = String(blackHole.status || "").toLowerCase();
  const note = String(blackHole.note || "").toLowerCase();
  return blackHole.detected === false
    || status === "upper_limit"
    || status === "non_detection"
    || /upper limit|no .*detected|non[- ]detection/.test(note);
}

export function centralBlackHoleIsDetected(blackHole) {
  if (!blackHole || centralBlackHoleIsUpperLimit(blackHole)) return false;
  return blackHole.detected !== false
    && Number.isFinite(Number(blackHole.mass_msun))
    && Number(blackHole.mass_msun) > 0;
}

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v); }

export class GalaxyScene {
  constructor(data, initialIndex = 0) {
    this.data = data;
    this.objects = data.objects;
    this.group = new THREE.Group();
    this.t = 0;
    this.field = false;
    this.disks = [];      // {disk, edgeOn}
    this.bhRings = [];     // camera-facing BH accretion rings
    this.build(initialIndex);
  }

  _makeGalaxy(gx, Rg, N, opts = {}) {
    const rng = mulberry32(gx.name.length * 911 + 13);
    const core = new THREE.Color(gx.palette.core), arm = new THREE.Color(gx.palette.arm),
          hii = new THREE.Color(gx.palette.hii);
    const morph = gx.morphology;
    const root = new THREE.Group();

    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
    const arms = Math.max(2, gx.arms || 2), twist = morph === "barred_spiral" ? 3.2 : 2.6;
    const barLen = Rg * 0.36;
    const setC = (p, c) => { col[p*3] = c.r; col[p*3+1] = c.g; col[p*3+2] = c.b; };

    for (let p = 0; p < N; p++) {
      let x, y, z, c, s = 0.9 + rng() * 1.3;
      if (morph === "elliptical") {
        const rr = Rg * Math.pow(rng(), 2.1), u = rng() * TWO_PI, v = Math.acos(2 * rng() - 1);
        x = rr * Math.sin(v) * Math.cos(u); y = rr * Math.sin(v) * Math.sin(u) * 0.75; z = rr * Math.cos(v) * 0.62;
        c = core.clone().lerp(arm, Math.min(1, rr / Rg)); s *= 0.9;
      } else {
        const bulgeFrac = morph === "edge_on" ? 0.42 : 0.22;
        if (rng() < bulgeFrac) {
          const rr = Rg * 0.22 * Math.pow(rng(), 1.6), u = rng() * TWO_PI, v = Math.acos(2 * rng() - 1);
          x = rr * Math.sin(v) * Math.cos(u); y = rr * Math.cos(v) * 0.7; z = rr * Math.sin(v) * Math.sin(u);
          c = core.clone();
        } else {
          let rad = Rg * Math.pow(rng(), 0.62), theta;
          if (morph === "barred_spiral" && rad < barLen) {
            theta = (rng() < 0.5 ? 0 : Math.PI) + gauss(rng) * 0.12;
            x = rad * Math.cos(theta); z = rad * Math.sin(theta) * 0.25; y = gauss(rng) * 0.5 * (Rg / 34);
            c = core.clone().lerp(arm, 0.3 * rad / barLen);
            setC(p, c); pos[p*3]=x; pos[p*3+1]=y; pos[p*3+2]=z; siz[p]=s; continue;
          }
          const a = Math.floor(rng() * arms);
          theta = a * (TWO_PI / arms) + (rad / Rg) * twist * Math.PI + gauss(rng) * 0.28;
          x = rad * Math.cos(theta); z = rad * Math.sin(theta);
          y = gauss(rng) * (morph === "edge_on" ? 0.6 : 1.4) * (Rg / 34) * (1 - 0.6 * rad / Rg);
          c = core.clone().lerp(arm, Math.min(1, (rad / Rg) * 1.4));
          if (rng() < 0.05) { c = hii.clone(); s *= 1.8; }
        }
      }
      pos[p*3] = x; pos[p*3+1] = y; pos[p*3+2] = z; setC(p, c); siz[p] = s;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    const stars = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aColor; attribute float aSize; varying vec3 vC;
        void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize=aSize*(300.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5);
        if(d>0.5) discard; float a=pow(smoothstep(0.5,0.0,d),1.5); gl_FragColor=vec4(vC,a*0.9); }`,
    }));
    const coreSprite = new THREE.Mesh(new THREE.SphereGeometry(Rg * 0.10, 24, 24),
      new THREE.MeshBasicMaterial({ color: core, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending }));
    // luminous nuclear glow — galaxy cores burn like they do in photographs
    const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: core, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    coreGlow.scale.setScalar(Rg * 1.05);

    // dark dust lanes tracing the leading edge of each arm (photographic depth)
    if (morph !== "elliptical") {
      const nD = Math.floor(N * 0.22);
      const dp = new Float32Array(nD * 3), ds = new Float32Array(nD);
      for (let p = 0; p < nD; p++) {
        const rad = Rg * (0.22 + 0.75 * Math.pow(rng(), 0.7));
        const a = Math.floor(rng() * arms);
        const theta = a * (TWO_PI / arms) + (rad / Rg) * twist * Math.PI + 0.16 + gauss(rng) * 0.1;
        dp[p*3] = rad * Math.cos(theta);
        dp[p*3+1] = gauss(rng) * 0.35 * (Rg / 34);
        dp[p*3+2] = rad * Math.sin(theta);
        ds[p] = 2.2 + rng() * 3.4;
      }
      const dg = new THREE.BufferGeometry();
      dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
      dg.setAttribute("aSize", new THREE.BufferAttribute(ds, 1));
      var dust = new THREE.Points(dg, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.NormalBlending,
        vertexShader: `attribute float aSize; void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;
          gl_FragColor = vec4(0.05, 0.028, 0.015, smoothstep(0.5, 0.05, d) * 0.32); }`,
      }));
      dust.renderOrder = 2;   // always composites over the additive stars
    }

    const disk = new THREE.Group(); disk.add(stars, coreSprite, coreGlow);
    if (dust) disk.add(dust);
    let edgeOn = false;
    if (morph === "edge_on") {
      const lane = new THREE.Mesh(new THREE.CylinderGeometry(Rg * 0.98, Rg * 0.98, 0.8 * (Rg / 34), 64, 1, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(gx.palette.dust), transparent: true, opacity: 0.85,
          side: THREE.DoubleSide, depthWrite: false }));
      lane.rotation.x = Math.PI / 2; disk.add(lane);
      disk.rotation.z = Math.PI / 2 - 0.22; disk.rotation.x = 0.12; edgeOn = true;
    }
    root.add(disk);
    this.disks.push({ disk, edgeOn });

    // --- marker only for a published central black-hole detection ---
    if (centralBlackHoleIsDetected(gx.central_bh)) {
      const bh = gx.central_bh, big = bh.mass_msun > 1e6;
      const bhR = Rg * (big ? 0.05 : 0.035);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(bhR, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000 }));
      // bright golden accretion ring so the BH is visible against the bright core
      const ring = new THREE.Mesh(new THREE.RingGeometry(bhR * 1.25, bhR * 3.4, 48),
        new THREE.MeshBasicMaterial({ color: big ? 0xffc24a : 0x9fb4d6, transparent: true,
          opacity: 1.0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      const bhGroup = new THREE.Group(); bhGroup.add(sphere, ring);
      bhGroup.userData = { kind: "galaxy_bh", data: bh, galaxy: gx.name };
      root.add(bhGroup);
      this.bhRings.push(ring);
      this.pickables.push(sphere); sphere.userData = bhGroup.userData;
      if (opts.bhLabel) {
        const d = document.createElement("div"); d.className = "label3d";
        d.style.color = "#ffc24a"; d.style.fontSize = "10px";
        d.textContent = "⚫ " + bh.name;
        const cl = new CSS2DObject(d); cl.position.set(0, -bhR - Rg * 0.12, 0); root.add(cl);
      }
    }

    // label + pick sphere
    const lab = document.createElement("div");
    lab.className = "label3d sun";
    lab.textContent = gx.catalogue === "—" ? gx.name : `${gx.name} (${gx.catalogue})`;
    const cl = new CSS2DObject(lab); cl.position.set(0, Rg * (opts.field ? 0.62 : 0.5), 0); root.add(cl);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(Rg * 0.55, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData = { kind: "galaxy", data: gx };
    root.add(pick); this.pickables.push(pick);

    return root;
  }

  _reset() {
    disposeObject3D(this.group);
    this.group.clear();
    this.disks = []; this.bhRings = []; this.pickables = [];
  }

  build(i) {                      // single-galaxy explorer
    this.field = false; this.index = i;
    this._reset();
    this.group.add(this._makeGalaxy(this.objects[i], R, 26000, { bhLabel: true }));
  }

  buildField() {                  // all galaxies together
    this.field = true;
    this._reset();
    this.objects.forEach((gx, k) => {
      const g = this._makeGalaxy(gx, 11, 5200, { field: true, bhLabel: true });
      const p = FIELD_POS[k % FIELD_POS.length];
      g.position.set(p[0], p[1], p[2]);
      g.rotation.y = k * 0.7; g.rotation.x = (k % 3) * 0.2;
      this.group.add(g);
    });
  }

  update(dt, camera) {
    this.t += dt;
    for (const d of this.disks) if (!d.edgeOn) d.disk.rotation.y = this.t * 0.03;
    if (camera) for (const r of this.bhRings) r.lookAt(camera.getWorldPosition(new THREE.Vector3()));
  }

  names() { return this.objects.map(o => o.catalogue === "—" ? o.name : `${o.name} — ${o.catalogue}`); }
}
