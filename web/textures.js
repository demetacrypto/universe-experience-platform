// Procedural, copyright-free planet / sun / ring textures generated on a canvas.
// Original fractal-noise generation — no external image assets.
import * as THREE from "three";

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise on a GxG grid that wraps in X (so textures tile seamlessly in longitude).
function makeNoise(seed, G = 256) {
  const rnd = mulberry32(seed);
  const grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (xi, yi) => grid[((yi % G + G) % G) * G + ((xi % G + G) % G)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = smooth(x - xi), fy = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

function fbm(noise, x, y, oct = 5) {
  let v = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * noise(x * freq, y * freq);
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return v / norm;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const W = 1024, H = 512;

export function makePlanetTexture(name, type, palette, seed = 1) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  // height/bump map built in the same loop (cheap relief detail)
  const bcv = document.createElement("canvas");
  bcv.width = W; bcv.height = H;
  const bctx = bcv.getContext("2d");
  const bimg = bctx.createImageData(W, H);
  const bd = bimg.data;
  const n1 = makeNoise(seed, 256);
  const n2 = makeNoise(seed + 99, 256);

  for (let y = 0; y < H; y++) {
    const lat = y / H;                 // 0 top .. 1 bottom
    const polar = Math.abs(lat - 0.5) * 2; // 0 equator .. 1 pole
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let col, h = 0.5;
      const gx = u * 8, gy = lat * 8;  // grid coords (x wraps over 8 grid cells -> seamless)

      if (type === "gas_giant" || type === "ice_giant") {
        const base = hexToRgb(palette.base);
        const b1 = hexToRgb(palette.band1 || palette.base);
        const b2 = hexToRgb(palette.band2 || palette.base);
        // horizontal bands warped by turbulence
        const turb = (fbm(n1, gx * 0.6, gy * 3.0, 4) - 0.5) * 0.18;
        const bands = 0.5 + 0.5 * Math.sin((lat + turb) * Math.PI * 18);
        h = bands;
        col = mix(b1, b2, bands);
        col = mix(col, base, 0.35 + 0.3 * fbm(n2, gx, gy * 2, 3));
        // storm spot
        if (palette.spot) {
          const sx = 0.62, sy = 0.40, dx = (u - sx), dy = (lat - sy);
          const dd = Math.sqrt((dx * 2.4) ** 2 + (dy * 4.5) ** 2);
          if (dd < 0.16) col = mix(col, hexToRgb(palette.spot), (0.16 - dd) / 0.16 * 0.9);
        }
      } else if (name === "Earth") {
        const ocean = hexToRgb(palette.ocean), land = hexToRgb(palette.land), ice = hexToRgb(palette.ice);
        const e = fbm(n1, gx * 1.3, gy * 1.3, 6);
        h = e > 0.52 ? 0.55 + (e - 0.52) : 0.45;   // land raised, oceans flat
        col = e > 0.52 ? mix(land, mix(land, [120, 100, 70], 0.4), (e - 0.52) * 3) : mix([10, 40, 90], ocean, e / 0.52);
        if (polar > 0.82 - 0.1 * fbm(n2, gx, gy, 3)) col = mix(col, ice, (polar - 0.7) / 0.3);
      } else if (name === "Mars") {
        const base = hexToRgb(palette.base), low = hexToRgb(palette.low), high = hexToRgb(palette.high);
        const e = fbm(n1, gx * 1.6, gy * 1.6, 6);
        h = e;
        col = mix(low, high, e);
        col = mix(col, base, 0.4);
        if (palette.ice && polar > 0.9 - 0.06 * fbm(n2, gx, gy, 2)) col = mix(col, hexToRgb(palette.ice), 0.85);
      } else if (type === "cloud") {
        // white where cloud, black where clear (used as colour + alpha map)
        const e = fbm(n1, gx * 1.7, gy * 1.7, 5);
        const c = Math.max(0, Math.min(1, (e - 0.46) * 2.6));
        col = [255 * c, 255 * c, 255 * c]; h = c;
      } else {
        // generic terrestrial (Mercury/Venus): cratered / mottled
        const base = hexToRgb(palette.base);
        const low = hexToRgb(palette.low || palette.base), high = hexToRgb(palette.high || palette.base);
        const e = fbm(n1, gx * 2.0, gy * 2.0, 6);
        h = e;
        col = mix(low, high, e);
        col = mix(col, base, 0.3);
      }

      const i = (y * W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      const b = Math.max(0, Math.min(255, h * 255)) | 0;
      bd[i] = b; bd[i + 1] = b; bd[i + 2] = b; bd[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 16;
  const bump = new THREE.CanvasTexture(bcv);
  bump.anisotropy = 8;
  return { map: tex, bump };
}

export function makeSunTexture(palette, seed = 7) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const n = makeNoise(seed, 256);
  const base = hexToRgb(palette.base), hot = hexToRgb(palette.hot), spot = hexToRgb(palette.spot);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const g = fbm(n, u * 16, v * 16, 5);
      let col = mix(base, hot, g);
      if (g < 0.32) col = mix(col, spot, (0.32 - g) * 2);
      const i = (y * W + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Radial ring texture with a Cassini-style gap and noisy banding; returns a
// texture meant to be sampled radially (mapped via custom UVs on a ring mesh).
export function makeRingTexture(ring, seed = 3) {
  const N = 1024;
  const cv = document.createElement("canvas");
  cv.width = N; cv.height = 1;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(N, 1);
  const d = img.data;
  const rnd = mulberry32(seed);
  const col = hexToRgb(ring.color || "#cbbf9c");
  for (let x = 0; x < N; x++) {
    const t = x / N;
    let a = ring.opacity * (0.55 + 0.45 * Math.sin(t * 60 + rnd() * 0.2));
    a *= 0.7 + 0.3 * rnd();
    // Cassini division around 70% of the way out
    if (t > 0.62 && t < 0.68) a *= 0.12;
    if (t < 0.04 || t > 0.98) a *= 0.2;
    const i = x * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
    d[i + 3] = Math.max(0, Math.min(255, a * 255));
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
