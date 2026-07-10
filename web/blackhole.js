// Black-hole showcase (L5): an EHT-anchored schematic — a dark shadow, a
// stylised lensing ring and a temperature-graded accretion disk. Measured
// parameters set the reference scale; this is not a GR ray-traced prediction
// or a reconstruction of an EHT image.
import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { glowTexture } from "./solarsystem.js";
import { disposeObject3D } from "./scene-utils.js";

const FALLBACK_SHADOW_DIAMETER_RS = 5.2;

export function shadowRadiusRs(object) {
  const diameter = Number(object?.shadow_diameter_rs);
  const normalizedDiameter = Number.isFinite(diameter) && diameter > 0
    ? diameter
    : FALLBACK_SHADOW_DIAMETER_RS;
  return normalizedDiameter / 2;
}

export class BlackHoleScene {
  constructor(data) {
    this.data = data;
    this.objects = data.objects;
    this.group = new THREE.Group();
    this.index = 0;
    this.time = 0;
    // Scene coordinates are normalized directly to Schwarzschild radii.
    this.unitsPerRs = 1;
    this.shadowRadiusRs = FALLBACK_SHADOW_DIAMETER_RS / 2;
    this.build(0);
  }

  build(i) {
    this.index = i;
    disposeObject3D(this.group);
    this.group.clear();
    const o = this.objects[i];
    const R = shadowRadiusRs(o);
    this.shadowRadiusRs = R;
    const hot = new THREE.Color(o.disk_color_hot);
    const cool = new THREE.Color(o.disk_color_cool);
    const inner = new THREE.Color(0xdfeeff); // hot inner edge (relativistic blue-white)

    // --- apparent shadow silhouette (not the smaller event horizon) ---
    const horizon = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96),
      new THREE.MeshBasicMaterial({ color: 0x000000 }));
    horizon.userData = { kind: "blackhole", data: o };
    this.group.add(horizon);
    this.pickables = [horizon];

    // --- stylised lensing ring: bright, camera-facing, Doppler-asymmetric ---
    const haloGeo = new THREE.RingGeometry(R * 1.0, R * 1.5, 256, 1);
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHot: { value: hot }, uCool: { value: cool }, uInner: { value: inner } },
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `
        uniform float uTime; uniform vec3 uHot, uCool, uInner; varying vec2 vP;
        void main(){
          float r = length(vP);
          float ang = atan(vP.y, vP.x);
          // Stylised bright lensing band outside the shadow (no inner fill).
          float ering = smoothstep(${(R*1.0).toFixed(2)}, ${(R*1.04).toFixed(2)}, r) * smoothstep(${(R*1.32).toFixed(2)}, ${(R*1.08).toFixed(2)}, r);
          float beam = 0.5 + 0.9 * pow(0.5 + 0.5*sin(ang - 1.2), 2.0);
          beam *= 0.88 + 0.12 * sin(uTime * 2.6 + ang * 7.0);   // turbulent flicker
          vec3 col = mix(mix(uInner, uHot, 0.35), vec3(1.0, 0.85, 0.58), 0.5) * beam;
          gl_FragColor = vec4(col, ering * beam * 1.15);
        }`,
    });
    this.halo = new THREE.Mesh(haloGeo, this.haloMat);
    this.group.add(this.halo);

    // --- accretion disk: edge-on, temperature-graded, Doppler-beamed ---
    const dIn = R * 1.5, dOut = R * 6.5;
    const diskGeo = new THREE.RingGeometry(dIn, dOut, 256, 8);
    this.diskMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uInner: { value: dIn }, uOuter: { value: dOut },
        uHot: { value: hot }, uCool: { value: cool }, uHotInner: { value: inner } },
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending,
      vertexShader: `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `
        uniform float uTime, uInner, uOuter; uniform vec3 uHot, uCool, uHotInner; varying vec2 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float r = length(vP);
          float t = clamp((r-uInner)/(uOuter-uInner), 0.0, 1.0);
          float ang = atan(vP.y, vP.x);
          // differentially-sheared turbulent streaks (inner orbits faster)
          float shear = uTime * (1.8 - 1.2*t);
          float streak = noise(vec2(ang*6.0 + r*0.4 - shear, r*1.5));
          streak = 0.40 + 0.60*(0.65*streak + 0.35*noise(vec2(ang*20.0 - shear*1.7, r*3.2)));
          // cinematic temperature ramp: white-hot inner edge -> orange -> deep ember
          vec3 cWhite = vec3(1.0, 0.97, 0.90), cOrange = vec3(1.0, 0.50, 0.12),
               cRed = vec3(0.55, 0.12, 0.025);
          vec3 base = t < 0.16 ? mix(cWhite, cOrange, t/0.16)
                               : mix(cOrange, cRed, pow((t-0.16)/0.84, 0.75));
          // strong relativistic beaming: approaching side blazes, receding side embers
          float phase = 0.5 + 0.5*sin(ang - 1.2);
          float beam = mix(0.15, 2.2, pow(phase, 1.7));
          vec3 col = base * beam * (0.5 + 0.8*streak);
          col = mix(col, col * vec3(0.8, 0.93, 1.35), 0.4 * pow(phase, 3.0) * (1.0 - t));
          float a = smoothstep(0.0, 0.05, t) * pow(1.0 - t, 1.3) * (0.45 + 0.55*streak);
          a *= 0.45 + 0.55*min(beam, 1.0);              // receding side fades too
          gl_FragColor = vec4(col, clamp(a * 1.15, 0.0, 1.0));
        }`,
    });
    this.disk = new THREE.Mesh(diskGeo, this.diskMat);
    this.disk.rotation.x = -Math.PI / 2 + 0.20;   // near edge-on (thin band)
    this.group.add(this.disk);

    // --- gravitationally-lensed far-side disk: the light of the disk behind
    // the hole, bent over and under the shadow — the iconic "bent halo" look ---
    this.arcMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uTime; varying vec2 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float r = length(vP);
          float ang = atan(vP.y, vP.x);
          float t = clamp((r - ${(R*1.02).toFixed(2)}) / ${(R*1.9).toFixed(2)}, 0.0, 1.0);
          // two lensed lobes, hugging the shadow above and below
          float lobe = pow(abs(sin(ang)), 2.6);
          float band = smoothstep(0.0, 0.06, t) * pow(1.0 - t, 2.6);
          // same Doppler asymmetry as the main disk
          float beam = mix(0.3, 1.5, pow(0.5 + 0.5*sin(ang - 1.2), 1.6));
          float streak = 0.6 + 0.4 * noise(vec2(ang*10.0 - uTime*1.2, r*2.0));
          vec3 col = mix(vec3(1.0, 0.94, 0.82), vec3(1.0, 0.45, 0.1), t) * beam * streak;
          gl_FragColor = vec4(col, band * lobe * beam * 0.55);
        }`,
    });
    this.arcs = new THREE.Mesh(new THREE.RingGeometry(R * 1.02, R * 3.0, 256), this.arcMat);
    this.group.add(this.arcs);

    // orbiting hot spot — like the flares the EHT watches around Sgr A*
    this.hotspot = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xfff1d0, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    this.hotspot.scale.setScalar(R * 0.55);
    this.disk.add(this.hotspot);

    // --- relativistic jet (M87*) ---
    if (o.has_jet) {
      const jetGeo = new THREE.CylinderGeometry(0.1, 1.6, R * 11, 28, 1, true);
      const jetMat = new THREE.MeshBasicMaterial({ color: 0x9ec2ff, transparent: true,
        opacity: 0.16, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
      const up = new THREE.Mesh(jetGeo, jetMat); up.position.y = R * 5.5;
      const dn = new THREE.Mesh(jetGeo, jetMat.clone()); dn.position.y = -R * 5.5; dn.rotation.z = Math.PI;
      this.group.add(up, dn);
    }

    const lab = document.createElement("div");
    lab.className = "label3d sun"; lab.textContent = o.name;
    const cl = new CSS2DObject(lab); cl.position.set(0, R * 2.0, 0); this.group.add(cl);
  }

  update(dt, camera) {
    const R = this.shadowRadiusRs;
    this.time += dt;
    this.haloMat.uniforms.uTime.value = this.time;
    this.diskMat.uniforms.uTime.value = this.time;
    if (this.arcMat) this.arcMat.uniforms.uTime.value = this.time;
    if (this.arcs && camera) this.arcs.lookAt(camera.position);
    if (this.hotspot) {   // fast inner-orbit flare, brightening as it beams toward us
      const a = this.time * 1.5;
      this.hotspot.position.set(Math.cos(a) * R * 1.9, Math.sin(a) * R * 1.9, 0.02);
      this.hotspot.material.opacity = 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(a - 1.2));
    }
    if (camera) this.halo.lookAt(camera.position);   // halo always faces the camera
  }

  flyTarget() { return { position: new THREE.Vector3(0, 0, 0), radius: this.shadowRadiusRs * 3 }; }
  names() { return this.objects.map(o => `${o.name} — ${o.facts.location.split("(")[0].trim()}`); }
}
