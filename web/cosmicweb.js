// Cosmological layer: the local cosmic web from real galaxy redshifts (2MRS).
// Each point is a galaxy at its comoving position (Mpc), coloured by redshift.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

export class CosmicWeb {
  constructor(data) {
    this.data = data;
    this.group = new THREE.Group();

    const n = data.count;
    const pos = new Float32Array(data.positions);
    const col = new Float32Array(data.colors);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) size[i] = 1.0 + Math.random() * 1.4;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 1.0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vColor;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = clamp(aSize * uScale * (260.0 / -mv.z), 1.2, 12.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main(){
          vec2 d = gl_PointCoord - 0.5; float r = length(d);
          if (r > 0.5) discard;
          gl_FragColor = vec4(vColor, smoothstep(0.5, 0.0, r));
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);
    this.pickables = [this.points];

    // Milky Way (us) at the origin
    const mw = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    this.group.add(mw);
    const lab = document.createElement("div");
    lab.className = "label3d sun"; lab.textContent = "Milky Way (you are here)";
    const cl = new CSS2DObject(lab); cl.position.set(0, 4, 0); mw.add(cl);
  }

  update(dt) {   // barely-perceptible drift so the web never feels frozen
    this.group.rotation.y += dt * 0.004;
  }

  infoAt(i) {
    return {
      z: this.data.redshift[i],
      dist_mpc: Math.hypot(this.data.positions[i*3], this.data.positions[i*3+1], this.data.positions[i*3+2]),
    };
  }
}
