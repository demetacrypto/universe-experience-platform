// Nebula layer (L5, volumetric): a premium illustrative gas cloud built from
// thousands of soft additive sprites, shaped by the nebula's morphology class,
// with an embedded young-star cluster. Identity/distance/size are measured; the
// 3-D gas distribution is a declared procedural prior.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { glowTexture } from "./solarsystem.js";

const R = 18; // scene radius of the cloud

function gauss(rng) { // Box–Muller
  let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerpC = (a, b, t) => a.clone().lerp(b, t);

export class NebulaScene {
  constructor(data) {
    this.data = data;
    this.objects = data.objects;
    this.group = new THREE.Group();
    this.t = 0;
    this.build(0);
  }

  _samplePos(morph, rng, centers) {
    if (morph === "ring") {
      const a = rng() * Math.PI * 2, rad = R * (0.72 + gauss(rng) * 0.08);
      return new THREE.Vector3(Math.cos(a) * rad, gauss(rng) * R * 0.12, Math.sin(a) * rad);
    }
    if (morph === "pillars") {
      const c = centers[(rng() * centers.length) | 0];
      return new THREE.Vector3(c.x + gauss(rng) * 1.6, -R * 0.4 + rng() * R * 1.1, c.z + gauss(rng) * 1.6);
    }
    if (morph === "filaments") {
      const c = centers[(rng() * centers.length) | 0];
      const t = rng();
      return new THREE.Vector3(c.x * t * R, c.y * t * R, c.z * t * R).add(
        new THREE.Vector3(gauss(rng), gauss(rng), gauss(rng)).multiplyScalar(1.2));
    }
    // blobby (default)
    const c = centers[(rng() * centers.length) | 0];
    return new THREE.Vector3(c.x + gauss(rng) * R * 0.32, c.y + gauss(rng) * R * 0.32, c.z + gauss(rng) * R * 0.32);
  }

  build(i) {
    this.index = i;
    for (const ch of [...this.group.children]) this.group.remove(ch);
    const neb = this.objects[i];
    const rng = mulberry32(neb.name.length * 1337 + 7);
    const core = new THREE.Color(neb.palette.core), mid = new THREE.Color(neb.palette.mid), outer = new THREE.Color(neb.palette.outer);

    // clump / direction seeds
    const centers = [];
    const nC = neb.morphology === "pillars" ? 4 : neb.morphology === "filaments" ? 9 : 6;
    for (let k = 0; k < nC; k++) {
      const v = new THREE.Vector3(gauss(rng), gauss(rng), gauss(rng));
      if (neb.morphology === "filaments") v.normalize();
      else v.multiplyScalar(R * 0.32);
      centers.push(v);
    }

    const N = 5200;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
    for (let p = 0; p < N; p++) {
      const v = this._samplePos(neb.morphology, rng, centers);
      pos[p*3] = v.x; pos[p*3+1] = v.y; pos[p*3+2] = v.z;
      const r = Math.min(1, v.length() / R);
      let c = r < 0.45 ? lerpC(core, mid, r / 0.45) : lerpC(mid, outer, (r - 0.45) / 0.55);
      c = c.clone().multiplyScalar(0.65 + 0.5 * rng());
      col[p*3] = c.r; col[p*3+1] = c.g; col[p*3+2] = c.b;
      siz[p] = (2.2 + rng() * 5.5) * (1.2 - 0.4 * r);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    this.cloud = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 aColor; attribute float aSize; varying vec3 vC;
        void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize = aSize * (300.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC;
        void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
          float a=pow(smoothstep(0.5,0.0,d),1.6); gl_FragColor=vec4(vC, a*0.32); }`,
    }));
    this.group.add(this.cloud);

    // embedded young stars
    const sN = neb.star_count, sp = new Float32Array(sN * 3), ss = new Float32Array(sN);
    for (let s = 0; s < sN; s++) {
      const v = new THREE.Vector3(gauss(rng), gauss(rng), gauss(rng)).multiplyScalar(R * 0.45);
      sp[s*3] = v.x; sp[s*3+1] = v.y; sp[s*3+2] = v.z; ss[s] = rng() < 0.1 ? 3.5 : 1.4;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("aSize", new THREE.BufferAttribute(ss, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSize; uniform float uTime; varying float vT;
        void main(){
          float ph = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5) * 6.28;
          vT = 0.65 + 0.35 * sin(uTime * 2.2 + ph);           // newborn stars twinkle
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vT;
        void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
          float a=smoothstep(0.5,0.0,d); gl_FragColor=vec4(vec3(0.85,0.9,1.0)*vT, a*vT); }`,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.group.add(this.stars);

    // luminous heart — ionising radiation of the embedded cluster
    const heart = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: core, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    heart.scale.setScalar(R * 1.5);
    this.group.add(heart);

    // invisible pick target
    const pick = new THREE.Mesh(new THREE.SphereGeometry(R * 0.9, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData = { kind: "nebula", data: neb };
    this.group.add(pick);
    this.pickables = [pick];

    const lab = document.createElement("div");
    lab.className = "label3d sun"; lab.textContent = `${neb.name} (${neb.catalogue})`;
    const cl = new CSS2DObject(lab); cl.position.set(0, R * 1.05, 0); this.group.add(cl);
  }

  update(dt) {
    this.t += dt;
    this.group.rotation.y = this.t * 0.02;
    if (this.starMat) this.starMat.uniforms.uTime.value = this.t;
  }
  names() { return this.objects.map(o => `${o.name} — ${o.catalogue}`); }
}
