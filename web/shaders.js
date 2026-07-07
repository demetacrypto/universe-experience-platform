// Small reusable materials for premium look: atmospheric rim glow and a soft
// sun corona. Both are self-contained GLSL ShaderMaterials.
import * as THREE from "three";

// Fresnel atmosphere: brightest at the limb, fades to centre. Rendered on a
// slightly larger BackSide sphere so it haloes the planet.
export function atmosphereMaterial(colorHex, intensity = 1.0) {
  const c = new THREE.Color(colorHex);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: c }, uIntensity: { value: intensity } },
    transparent: true, side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vN; varying vec3 vP;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vP = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uIntensity; varying vec3 vN; varying vec3 vP;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vP))), 4.0);
        gl_FragColor = vec4(uColor, f * uIntensity);
      }`,
  });
}

// Photosphere: real texture + limb darkening (bright centre, orange limb —
// like actual solar photographs) + slowly boiling granulation. Kills the
// "flat white ball" look at every distance.
export function sunSurfaceMaterial(map) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vP; varying vec3 vO; varying vec2 vUv;
      void main(){
        vN = normalize(normalMatrix * normal);
        vO = normal; vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vP = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uTime;
      varying vec3 vN; varying vec3 vP; varying vec3 vO; varying vec2 vUv;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p){
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(
          mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main(){
        vec3 tex = texture2D(uMap, vUv).rgb;
        float mu = clamp(abs(dot(normalize(vN), normalize(vP))), 0.0, 1.0);
        float limb = pow(mu, 0.6);                       // limb darkening
        float gran = 0.82 + 0.28 * noise(vO * 22.0 + uTime * 0.25)
                   + 0.10 * noise(vO * 55.0 - uTime * 0.4);
        vec3 tint = mix(vec3(1.0, 0.38, 0.06), vec3(1.0, 0.97, 0.86), limb);
        vec3 col = tex * tint * (0.30 + 0.75 * limb) * gran * 0.72;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// Living corona: fresnel rim modulated by animated 3-D value noise — the
// Sun's edge boils and flickers instead of sitting as a flat halo.
export function animatedCoronaMaterial(colorHex) {
  const c = new THREE.Color(colorHex);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: c }, uTime: { value: 0 }, uR: { value: 1 } },
    transparent: true, side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vN; varying vec3 vP; varying vec3 vO;
      void main(){
        vN = normalize(normalMatrix * normal);
        vO = normal;                                  // object space, stable for noise
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vP = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uR;
      varying vec3 vN; varying vec3 vP; varying vec3 vO;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p){
        vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(
          mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
      }
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vP))), 2.6);
        float n = 0.65 * noise(vO * 4.0 + uTime * 0.45)
                + 0.35 * noise(vO * 9.0 - uTime * 0.7);
        float a = f * (0.45 + 0.75 * n);
        // fade out as the camera dives inside the shell (no white-out close up)
        a *= smoothstep(uR * 1.02, uR * 1.55, length(cameraPosition));
        vec3 col = mix(uColor, vec3(1.0, 0.86, 0.55), n * 0.5);
        gl_FragColor = vec4(col, a);
      }`,
  });
}

// Soft additive corona sprite-like shell for the Sun.
export function coronaMaterial(colorHex) {
  const c = new THREE.Color(colorHex);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: c } },
    transparent: true, side: THREE.BackSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vN; varying vec3 vP;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vP = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vP))), 3.5);
        gl_FragColor = vec4(uColor, f * 0.9);
      }`,
  });
}
