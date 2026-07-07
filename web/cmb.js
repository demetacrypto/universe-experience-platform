// Cosmic Microwave Background layer: the surface of last scattering rendered as
// an inside-out all-sky shell. The viewer sits at the centre looking out at the
// oldest light in the universe. Parameters are measured (Planck/WMAP/COBE); the
// mottled anisotropy pattern is a representative procedural Gaussian field.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function makeNoise(seed, G = 256) {
  const rnd = mulberry32(seed), grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x, y) => grid[((y % G + G) % G) * G + ((x % G + G) % G)];
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}
function fbm(n, x, y, o = 6) { let v = 0, a = 0.5, f = 1, s = 0; for (let i = 0; i < o; i++) { v += a * n(x * f, y * f); s += a; a *= 0.5; f *= 2; } return v / s; }
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function ramp(pal, t) { // 5-stop cold->hot temperature ramp
  const cold = hex(pal.cold), cool = hex(pal.cool), mid = hex(pal.mid), warm = hex(pal.warm), hot = hex(pal.hot);
  if (t < 0.25) return mix(cold, cool, t / 0.25);
  if (t < 0.5) return mix(cool, mid, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(mid, warm, (t - 0.5) / 0.25);
  return mix(warm, hot, (t - 0.75) / 0.25);
}

export class CMBScene {
  constructor(data) {
    this.data = data;
    this.group = new THREE.Group();
    this.t = 0;
    this._build();
  }

  _texture() {
    const W = 2048, H = 1024, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H), d = img.data;
    const n1 = makeNoise(7, 256), n2 = makeNoise(91, 256);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W, v = y / H;
        // multi-scale Gaussian-random-field-like fluctuations (acoustic-ish)
        let g = 0.5 + 0.95 * (fbm(n1, u * 18, v * 18, 6) - 0.5) + 0.5 * (fbm(n2, u * 42, v * 42, 5) - 0.5);
        // push contrast away from mid (more saturated cold/hot spots, less white wash)
        g = 0.5 + (g - 0.5) * 1.45;
        g = Math.max(0, Math.min(1, g));
        const c = ramp(this.data.palette, g);
        const i = (y * W + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  _build() {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(400, 96, 96),
      new THREE.MeshBasicMaterial({ map: this._texture(), side: THREE.BackSide }));
    sphere.userData = { kind: "cmb", data: this.data };
    this.group.add(sphere);
    this.sphere = sphere;
    this.pickables = [sphere];

    const lab = document.createElement("div");
    lab.className = "label3d sun"; lab.textContent = "Cosmic Microwave Background";
    const cl = new CSS2DObject(lab); cl.position.set(0, 60, -180); this.group.add(cl);
  }

  update(dt) { this.t += dt; this.sphere.rotation.y = this.t * 0.006; }
}
