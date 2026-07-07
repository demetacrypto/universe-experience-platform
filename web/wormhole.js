// Wormhole layer (THEORETICAL): a traversable Einstein–Rosen bridge rendered
// as a gravitationally-lensed throat — a swirling, lensed starfield inside a
// bright Einstein ring. This is a visualisation of the geometry predicted by
// general relativity, clearly declared THEORETICAL: no wormhole has ever been
// observed. (Einstein & Rosen 1935; Morris & Thorne 1988.)
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { glowTexture } from "./solarsystem.js";

const R = 6;   // throat radius (scene units)

export const WORMHOLE = {
  name: "Wormhole",
  long_name: "Traversable wormhole (Einstein–Rosen bridge)",
  facts: {
    status: "THEORETICAL — never observed",
    origin: "Einstein & Rosen (1935)",
    traversable: "Morris–Thorne (1988) — needs exotic matter",
    throat: "A bridge between two regions of spacetime",
    note: "A hypothetical shortcut through spacetime. The render shows starlight lensing around the throat — a visualisation of the mathematics, not an observation.",
  },
  credit: "Geometry: Einstein & Rosen (1935); Morris & Thorne (1988). Render is a pure simulation.",
};

export class WormholeScene {
  constructor() {
    this.group = new THREE.Group();
    this.t = 0;
    this.pickables = [];

    // --- lensed throat: swirled starfield, strongest distortion at the limb ---
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vP; varying vec3 vO;
        void main(){
          vN = normalize(normalMatrix * normal);
          vO = normal;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vP = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vN; varying vec3 vP; varying vec3 vO;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main(){
          float mu = clamp(abs(dot(normalize(vN), normalize(vP))), 0.0, 1.0);
          // lensing: light wraps harder near the limb; slow overall precession
          float tw = 4.5 * pow(1.0 - mu, 2.2) + uTime * 0.05;
          vec3 sd = normalize(vO);
          float cs = cos(tw), sn = sin(tw);
          sd = vec3(cs*sd.x - sn*sd.z, sd.y, sn*sd.x + cs*sd.z);
          // the "other side": a cold, dense starfield seen through the throat
          vec3 g = sd * 26.0; vec3 id = floor(g); vec3 fr = fract(g) - 0.5;
          float h = hash(id);
          float star = smoothstep(0.22, 0.0, length(fr)) * step(0.78, h);
          float tint = hash(id + 7.0);
          vec3 scol = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.85, 0.65), tint);
          vec3 col = scol * star * (1.2 + 0.8 * sin(uTime * 1.5 + h * 40.0));
          col += vec3(0.010, 0.018, 0.045);                    // deep space floor
          // blue-white lensed rim (the Einstein ring seen edge-on)
          float rim = pow(1.0 - mu, 3.6);
          col += vec3(0.55, 0.75, 1.0) * rim * 1.15;
          // faint violet caustic just inside the rim
          col += vec3(0.55, 0.35, 0.9) * pow(1.0 - mu, 1.6) * 0.22;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const throat = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96), this.mat);
    throat.userData = { kind: "wormhole", data: WORMHOLE };
    this.group.add(throat);
    this.pickables.push(throat);

    // --- camera-facing Einstein ring ---
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP2; void main(){ vP2 = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; varying vec2 vP2;
        void main(){
          float r = length(vP2);
          float ang = atan(vP2.y, vP2.x);
          float band = smoothstep(${(R * 1.01).toFixed(2)}, ${(R * 1.06).toFixed(2)}, r)
                     * smoothstep(${(R * 1.38).toFixed(2)}, ${(R * 1.10).toFixed(2)}, r);
          float shimmer = 0.92 + 0.08 * sin(uTime * 2.0 + ang * 26.0)
                        + 0.05 * sin(uTime * 3.1 - ang * 41.0);
          gl_FragColor = vec4(vec3(0.72, 0.85, 1.0) * shimmer, band * shimmer * 0.55);
        }`,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(R * 1.0, R * 1.45, 192), this.ringMat);
    this.group.add(this.ring);

    // ambient cold glow
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x86b4ff, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(R * 5);
    this.group.add(glow);

    const lab = document.createElement("div");
    lab.className = "label3d sun";
    lab.textContent = "Wormhole (theoretical)";
    const cl = new CSS2DObject(lab); cl.position.set(0, R * 1.8, 0);
    this.group.add(cl);
  }

  update(dt, camera) {
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    this.ringMat.uniforms.uTime.value = this.t;
    if (camera) this.ring.lookAt(camera.position);
  }
}
