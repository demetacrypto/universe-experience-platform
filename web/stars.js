// Stellar neighbourhood layer (L1): Gaia measurements when live ingestion
// succeeds, otherwise an explicitly procedural sample. Both render as additive
// sprites with confidence colouring and per-star uncertainty visualisation.
import * as THREE from "three";

const CONF_COLOR = {
  measured: [0.37, 0.82, 1.0], inferred: [1.0, 0.83, 0.42],
  modelled: [0.69, 0.63, 1.0], illustrative: [1.0, 0.42, 0.94],
};

export class StarField {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.uncertaintyGroup = new THREE.Group();
    this.group.add(this.uncertaintyGroup);
  }

  build(sceneData) {
    this.data = sceneData;
    const n = sceneData.count;
    const pos = new Float32Array(sceneData.positions);
    const baseColor = new Float32Array(sceneData.colors);
    const confColor = new Float32Array(n * 3);
    const size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = CONF_COLOR[sceneData.confidence[i]] || [1, 1, 1];
      confColor[i * 3] = c[0]; confColor[i * 3 + 1] = c[1]; confColor[i * 3 + 2] = c[2];
      size[i] = THREE.MathUtils.clamp(Math.pow(2, -0.32 * (sceneData.mag[i] - 6.0)), 0.6, 22.0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColorStar", new THREE.BufferAttribute(baseColor, 3));
    geo.setAttribute("aColorConf", new THREE.BufferAttribute(confColor, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uPointScale: { value: 1.6 }, uConf: { value: 0.0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColorStar; attribute vec3 aColorConf; attribute float aSize;
        uniform float uPointScale; uniform float uConf; varying vec3 vColor; varying float vBright;
        void main(){
          vColor = mix(aColorStar, aColorConf, uConf);
          vBright = clamp((aSize - 3.0) / 12.0, 0.0, 1.0);   // brightest stars get spikes
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = clamp(aSize * uPointScale * (300.0 / -mv.z), 1.0, 72.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vBright;
        void main(){
          vec2 d = gl_PointCoord - vec2(0.5); float r = length(d);
          float core = smoothstep(0.5, 0.0, r);
          // 4-point diffraction spikes (telescope look) for the brightest stars
          float sx = smoothstep(0.5, 0.0, abs(d.x)) * (1.0 - smoothstep(0.0, 0.05, abs(d.y)));
          float sy = smoothstep(0.5, 0.0, abs(d.y)) * (1.0 - smoothstep(0.0, 0.05, abs(d.x)));
          float spike = (sx + sy) * vBright * 0.7;
          float a = clamp(core + spike, 0.0, 1.0);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);
    this.pickables = [this.points];
  }

  setConfidenceColor(on) { this.points.material.uniforms.uConf.value = on ? 1 : 0; }
  setPointScale(v) { this.points.material.uniforms.uPointScale.value = v; }

  posOf(i) {
    return new THREE.Vector3(
      this.data.positions[i * 3], this.data.positions[i * 3 + 1], this.data.positions[i * 3 + 2]);
  }

  flyTargetIndex(i) { return { position: this.posOf(i), radius: 4 }; }

  drawUncertainty(i, unc, camera, show) {
    this.uncertaintyGroup.clear();
    const star = this.posOf(i);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6, 7.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x6cc7ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.position.copy(star); ring.lookAt(camera.position);
    this.uncertaintyGroup.add(ring);
    if (show && unc != null && unc > 0) {
      const dir = star.clone().normalize();
      const a = star.clone().add(dir.clone().multiplyScalar(unc));
      const b = star.clone().add(dir.clone().multiplyScalar(-unc));
      this.uncertaintyGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineBasicMaterial({ color: 0x6cc7ff })));
    }
    this._ring = this.uncertaintyGroup.children[0];
  }

  faceRing(camera) { if (this._ring) this._ring.lookAt(camera.position); }
  clearUncertainty() { this.uncertaintyGroup.clear(); this._ring = null; }
}
