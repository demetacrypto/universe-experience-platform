// Universe Experience Platform — premium client orchestrator (4 layers).
// Solar System · Exoplanets · Stellar Neighbourhood · Cosmic Web, over one
// backend, with bloom, 3D labels, cinematic fly-to, and time controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { setMaxAnisotropy } from "./realtex.js";
import { SolarSystem } from "./solarsystem.js";
import { ExoExplorer } from "./exoplanets.js";
import { StarField } from "./stars.js";
import { CosmicWeb } from "./cosmicweb.js";
import { BlackHoleScene } from "./blackhole.js";
import { NebulaScene } from "./nebula.js";
import {
  GalaxyScene,
  centralBlackHoleIsUpperLimit,
} from "./galaxymodel.js";
import { CMBScene } from "./cmb.js";
import { WormholeScene } from "./wormhole.js";
import { drawHR, drawTransit, drawRedshift } from "./datainspect.js";
import { startAmbient, setAudioMuted, whoosh } from "./sound.js";
import { tempFromBpRp, spectralClass, STAR_FACTS } from "./starinfo.js";
import { lookupKnowledge } from "./knowledge.js";
import { createLazyInitializer } from "./scene-utils.js";
import {
  escapeHtml,
  getQualityProfile,
  getProvenancePresentation,
  isInteractiveShortcutTarget,
  isSoftwareRendererName,
} from "./ui-utils.js";

performance.mark("uep:boot-start");

const API = "";
const fetchJSON = (u) => fetch(u).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
const trusted = (value) => ({ trustedHtml: String(value) });
const row = (key, value) => {
  const rendered = value && typeof value === "object" && "trustedHtml" in value
    ? value.trustedHtml : escapeHtml(value);
  return `<tr><td class="k">${escapeHtml(key)}</td><td class="v">${rendered}</td></tr>`;
};
const evidenceBadge = (tone, label) => trusted(
  `<span class="badge ${escapeHtml(tone)}">${escapeHtml(label)}</span>`,
);
const taggedValue = (value, tone, label) => trusted(
  `${escapeHtml(value)} ${evidenceBadge(tone, label).trustedHtml}`,
);

const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let QUALITY = getQualityProfile({
  viewportWidth: innerWidth,
  viewportHeight: innerHeight,
  devicePixelRatio,
  reducedMotion: prefersReducedMotion,
});

const S = { layer: "solar", jd: 0, playing: true, speed: 2, exoSpin: true, follow: null, tourActive: false,
  reducedMotion: prefersReducedMotion, dataOpen: false, selStar: null, selExoPlanet: null,
  solarLabels: true,
  tween: null, raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2() };
const LAYER_ORDER = ["solar", "exo", "stars", "nebula", "galaxies", "cosmic", "cmb", "bh", "wh"];

let renderer, labelRenderer, composer, renderPass, bloom;
let SOFTWARE_RENDERER = false;
let solar, exo, stars, cosmic, bh, nebula, galaxyL, cmbL, wh, manifest;
let DATA;
let UNI_INDEX = [];
let L; // layer registry
const clock = new THREE.Clock();
let routeTimer = null;
/** @type {{key: string, activationMark: string} | null} */
let pendingLayerPaint = null;
/** @type {{panel: HTMLElement, trigger: HTMLElement | null, inertStates: Array<{element: Element, wasInert: boolean}>} | null} */
let activeModal = null;
const INTRO_INERT_SELECTORS = [
  "#scene", "#observatoryHeader", "#layers", "#search", "#hud",
  "#controlDeck", "#zoom", "#tourBar", ".skip-link",
];

const DESCRIPTIONS = {
  solar: "Our Solar System from JPL orbital elements — planets, dwarf planets, moons, rings and the asteroid belt, animated in real time.",
  exo: "Confirmed planetary systems from the NASA Exoplanet Archive or its bundled curated fallback, with derived conservative habitable zones.",
  stars: "A local stellar neighbourhood built from Gaia measurements when available and an explicitly illustrative sample when offline.",
  cosmic: "A local-universe redshift field from 2MRS when available, with a clearly identified procedural fallback for offline builds.",
  bh: "Horizon-scale black holes imaged by the Event Horizon Telescope — shown here as EHT-anchored schematics, not image reconstructions or ray-traced predictions.",
  cmb: "The cosmic microwave background — the universe's first light, from 380,000 years after the Big Bang, at the very edge of the observable universe.",
  nebula: "Famous nebulae rendered as illustrative volumetric gas clouds — observed identities, approximate literature dimensions and procedural structure.",
  galaxies: "Famous galaxies as procedural models matched to observed morphology and heterogeneous literature estimates.",
  wh: "A Morris–Thorne traversable wormhole model, distinct from the non-traversable Einstein–Rosen bridge. Purely theoretical and never observed.",
};

function applyRendererConstraints(profile) {
  if (!SOFTWARE_RENDERER) return profile;
  return Object.freeze({
    ...profile,
    bloom: false,
    bloomStrength: 0,
    particleScale: Math.min(profile.particleScale, 0.5),
  });
}

init();

async function init() {
  const canvas = document.getElementById("scene");
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: QUALITY.antialias,
    powerPreference: QUALITY.isMobile ? "low-power" : "high-performance",
  });
  renderer.setPixelRatio(QUALITY.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const gl = renderer.getContext();
  const debugRenderer = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererName = debugRenderer
    ? gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  SOFTWARE_RENDERER = isSoftwareRendererName(rendererName);
  QUALITY = applyRendererConstraints(QUALITY);
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  labelRenderer = new CSS2DRenderer({ element: document.getElementById("labels") });
  labelRenderer.setSize(innerWidth, innerHeight);

  document.getElementById("renderInfo").textContent =
    `${navigator.gpu ? "WebGPU ready" : "WebGL"} · ${QUALITY.tier}`;

  // scenes + cameras
  const solarScene = new THREE.Scene(), exoScene = new THREE.Scene(),
        starScene = new THREE.Scene(), cosmicScene = new THREE.Scene(),
        bhScene = new THREE.Scene(), nebulaScene = new THREE.Scene(), galaxyScene = new THREE.Scene(),
        cmbScene = new THREE.Scene(), whScene = new THREE.Scene();
  const solarCam = cam(50, 0.01, 100000, [0, 105, 235]); // starts wide; intro dollies in
  const exoCam = cam(50, 0.02, 5000, [0, 13, 30]);
  const starCam = cam(55, 0.1, 40000, [0, 120, 320]);
  const cosmicCam = cam(55, 0.5, 400000, [0, 90, 230]);
  const bhCam = cam(50, 0.05, 8000, [0, 6.5, 46]);   // low angle — EHT edge-on drama
  const nebulaCam = cam(52, 0.1, 9000, [0, 8, 64]);
  const galaxyCam = cam(52, 0.1, 9000, [0, 30, 78]);
  const cmbCam = cam(70, 0.1, 2000, [0, 0, 12]);
  const whCam = cam(52, 0.1, 9000, [0, 9, 56]);

  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(solarScene, solarCam);
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.55, 0.12);
  bloom.enabled = QUALITY.bloom;
  bloom.strength = QUALITY.bloomStrength;
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let solarData, exoData, starData, cosmicData, bhData, nebData, galData, cmbData;
  try {
    [solarData, exoData, starData, cosmicData, bhData, nebData, galData, cmbData, manifest] = await Promise.all([
      fetchJSON("./data/delivery/solar_system.json"),
      fetchJSON("./data/delivery/exoplanets.json"),
      fetchJSON("./data/delivery/scene.json"),
      fetchJSON("./data/delivery/cosmic_web.json"),
      fetchJSON("./data/delivery/black_holes.json"),
      fetchJSON("./data/delivery/nebulae.json"),
      fetchJSON("./data/delivery/resolved_galaxies.json"),
      fetchJSON("./data/delivery/cmb.json"),
      fetchJSON("./data/delivery/manifest.json"),
    ]);
  } catch (e) {
    document.querySelector("#loading span").textContent = "Could not load data — run the pipeline & serve via the API.";
    console.error(e); return;
  }

  // The viewport can rotate while payloads are loading. Re-evaluate before
  // allocating expensive scene textures and particle buffers.
  QUALITY = applyRendererConstraints(getQualityProfile({ viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio, reducedMotion: S.reducedMotion }));
  renderer.setPixelRatio(QUALITY.pixelRatio);
  bloom.enabled = QUALITY.bloom;
  bloom.strength = QUALITY.bloomStrength;
  document.getElementById("renderInfo").textContent =
    `${navigator.gpu ? "WebGPU ready" : "WebGL"} · ${QUALITY.tier}`;

  DATA = {
    solar: solarData,
    exo: exoData,
    stars: starData,
    cosmic: cosmicData,
    bh: bhData,
    nebula: nebData,
    galaxies: galData,
    cmb: cmbData,
  };
  S.jd = DATA.solar.epoch_jd;
  const density = QUALITY.particleScale;
  const markSceneReady = (key, value) => {
    performance.mark(`uep:scene:${key}-ready`);
    return value;
  };

  // Solar is the only boot-active scene. Every other constructor, particle
  // buffer, backdrop and selector is allocated on its first layer visit.
  solar = new SolarSystem(DATA.solar, {
    proceduralTextureQuality: QUALITY.isMobile ? "low" : "medium",
    detailMaps: !SOFTWARE_RENDERER && !QUALITY.isMobile,
    geometryQuality: !SOFTWARE_RENDERER && !QUALITY.isMobile ? "high" : "balanced",
  });
  solarScene.add(solar.group, backdrop(Math.round(2500 * density), 1400));
  addDust(solarScene, 90);
  markSceneReady("solar", solar);
  try {
    await renderer.compileAsync(solarScene, solarCam);
    performance.mark("uep:scene:solar-compiled");
  } catch (error) {
    // Browsers without parallel shader compilation still render correctly;
    // their first frame simply uses Three.js' normal synchronous fallback.
    console.warn("Solar shader precompile unavailable", error);
  }
  solar.setBootPreview(SOFTWARE_RENDERER);

  const lazyLayers = {
    exo: createLazyInitializer(() => {
      exo = new ExoExplorer(DATA.exo);
      exoScene.add(exo.group, backdrop(Math.round(2000 * density), 900));
      addDust(exoScene, 40);
      buildExoSelector();
      return markSceneReady("exo", exo);
    }),
    stars: createLazyInitializer(() => {
      stars = new StarField(starScene);
      stars.build(DATA.stars);
      starScene.add(stars.group, backdrop(Math.round(1500 * density), 6000));
      addDust(starScene, 420, 400, 40);
      return markSceneReady("stars", stars);
    }),
    cosmic: createLazyInitializer(() => {
      cosmic = new CosmicWeb(DATA.cosmic);
      cosmicScene.add(cosmic.group);
      return markSceneReady("cosmic", cosmic);
    }),
    bh: createLazyInitializer(() => {
      bh = new BlackHoleScene(DATA.bh);
      bhScene.add(bh.group, backdrop(Math.round(2500 * density), 1200));
      buildBHSelector();
      return markSceneReady("bh", bh);
    }),
    nebula: createLazyInitializer(() => {
      nebula = new NebulaScene(DATA.nebula);
      nebulaScene.add(nebula.group, backdrop(Math.round(2200 * density), 1500));
      addDust(nebulaScene, 60);
      buildNebulaSelector();
      return markSceneReady("nebula", nebula);
    }),
    galaxies: createLazyInitializer(() => {
      galaxyL = new GalaxyScene(DATA.galaxies, 1);
      galaxyScene.add(galaxyL.group, backdrop(Math.round(2400 * density), 1600));
      addDust(galaxyScene, 90);
      buildGalaxySelector();
      return markSceneReady("galaxies", galaxyL);
    }),
    cmb: createLazyInitializer(() => {
      cmbL = new CMBScene(DATA.cmb, { quality: "low" });
      cmbScene.add(cmbL.group);
      return markSceneReady("cmb", cmbL);
    }),
    wh: createLazyInitializer(() => {
      wh = new WormholeScene();
      whScene.add(wh.group, backdrop(Math.round(2600 * density), 1300));
      return markSceneReady("wh", wh);
    }),
  };

  L = {
    solar: { scene: solarScene, cam: solarCam, controls: mk(solarCam), panel: "solarControls",
      legend: false, labels: true, bloom: [0.3, 0.5], zoom: [4, 420], unit: "solar",
      update: (jd, dt) => solar.update(jd, dt, solarCam), pickables: () => solar.pickables, pick: (h) => showSolarInfo(h.object.userData, h.object) },
    exo: { scene: exoScene, cam: exoCam, controls: mk(exoCam), panel: "exoControls",
      legend: false, labels: true, bloom: [0.1, 0.8], zoom: [4, 220], unit: "exo",
      ensure: () => lazyLayers.exo.ensure(),
      update: (jd, dt) => { if (S.exoSpin) exo?.update(jd); exo?.tick(dt); }, pickables: () => exo?.pickables ?? [], pick: (h) => showExoInfo(h.object.userData) },
    stars: { scene: starScene, cam: starCam, controls: mk(starCam), panel: "starControls",
      legend: true, labels: false, bloom: [0.0, 0.9], zoom: [12, 1600], unit: "stars",
      ensure: () => lazyLayers.stars.ensure(),
      update: () => stars?.faceRing(starCam), pickables: () => stars?.pickables ?? [], pick: (h) => showStarInfo(h.index) },
    cosmic: { scene: cosmicScene, cam: cosmicCam, controls: mk(cosmicCam), panel: "cosmicControls",
      legend: false, labels: true, bloom: [0.0, 0.85], zoom: [25, 2200], unit: "cosmic",
      ensure: () => lazyLayers.cosmic.ensure(),
      update: (jd, dt) => cosmic?.update(dt), pickables: () => cosmic?.pickables ?? [], pick: (h) => showCosmicInfo(h.index) },
    bh: { scene: bhScene, cam: bhCam, controls: mk(bhCam), panel: "bhControls",
      legend: false, labels: true, bloom: [0.6, 0.32], zoom: [10, 160], unit: "bh",
      ensure: () => lazyLayers.bh.ensure(),
      update: (jd, dt) => bh?.update(dt, bhCam), pickables: () => bh?.pickables ?? [], pick: (h) => showBHInfo(h.object.userData) },
    nebula: { scene: nebulaScene, cam: nebulaCam, controls: mk(nebulaCam), panel: "nebulaControls",
      legend: false, labels: true, bloom: [0.0, 0.85], zoom: [22, 320], unit: "nebula",
      ensure: () => lazyLayers.nebula.ensure(),
      update: (jd, dt) => nebula?.update(dt), pickables: () => nebula?.pickables ?? [], pick: (h) => showNebulaInfo(h.object.userData) },
    galaxies: { scene: galaxyScene, cam: galaxyCam, controls: mk(galaxyCam), panel: "galaxyControls",
      legend: false, labels: true, bloom: [0.0, 0.8], zoom: [28, 700], unit: "galaxies",
      ensure: () => lazyLayers.galaxies.ensure(),
      update: (jd, dt) => galaxyL?.update(dt, galaxyCam), pickables: () => galaxyL?.pickables ?? [], pick: galaxyPick },
    cmb: { scene: cmbScene, cam: cmbCam, controls: mk(cmbCam), panel: "cmbControls",
      legend: false, labels: true, bloom: [0.85, 0.08], zoom: [4, 60], unit: "cmb",
      ensure: () => lazyLayers.cmb.ensure(),
      update: (jd, dt) => cmbL?.update(dt), pickables: () => cmbL?.pickables ?? [], pick: () => showCMBInfo() },
    wh: { scene: whScene, cam: whCam, controls: mk(whCam), panel: "whControls",
      legend: false, labels: true, bloom: [0.35, 0.65], zoom: [9, 160], unit: "wh",
      ensure: () => lazyLayers.wh.ensure(),
      update: (jd, dt) => wh?.update(dt, whCam), pickables: () => wh?.pickables ?? [], pick: (h) => showWormholeInfo(h.object.userData) },
  };
  L.cmb.controls.minDistance = 2; L.cmb.controls.maxDistance = 120;

  buildJumpButtons(solarData);
  document.getElementById("cmbSummary").innerHTML =
    `<b>Surface of last scattering</b> — observed 2.725 K mean · model-derived z ≈ 1089<br>The universe's first light, emitted about 380,000 years after the Big Bang in the standard cosmological model.`;
  UNI_INDEX = buildUniverseIndex(DATA);
  wireUI();
  wireZoom();
  setLayer("solar");
  addEventListener("resize", onResize);
  canvas.addEventListener("pointerdown", onPick);

  const ld = document.getElementById("loading");
  document.getElementById("enterBtn").addEventListener("click", () => enterUniverse(false));
  document.getElementById("introTour").addEventListener("click", () => enterUniverse(true));
  setIntroModalState(true);
  document.getElementById("enterBtn").focus({ preventScroll: true });
  animate();
  // Paint the boot-active Solar scene before fading the loading veil. The
  // readiness measure ends only after that fade is visibly complete.
  requestAnimationFrame(() => revealAtlas(ld));
}

function revealAtlas(loading) {
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.dataset.uepReady = "painted";
      performance.mark("uep:interactive");
      performance.measure("uep:cold-start", "uep:boot-start", "uep:interactive");
      loading.remove();
    }));
  };
  loading.addEventListener("transitionend", (event) => {
    if (event.propertyName === "opacity") complete();
  }, { once: true });
  loading.classList.add("gone");
  setTimeout(complete, 1_100);
}

// Dismiss the cinematic intro: slow establishing dolly into the system, or
// jump straight into the guided tour.
function transitionDuration(seconds) {
  return Math.max(0.001, seconds * QUALITY.transitionScale);
}

function setIntroModalState(active) {
  for (const selector of INTRO_INERT_SELECTORS) {
    const element = document.querySelector(selector);
    if (!element) continue;
    if (active) element.setAttribute("inert", "");
    else element.removeAttribute("inert");
  }
}

function enterUniverse(tour) {
  document.body.classList.remove("intro-active");
  setIntroModalState(false);
  closeMobileDrawers();
  solar.setBootPreview(false, {
    staged: SOFTWARE_RENDERER,
    onRevealBatch: () => setSceneLabels(L.solar.scene, S.layer === "solar" && L.solar.labels),
  });
  if (!SOFTWARE_RENDERER) setSceneLabels(L.solar.scene, S.layer === "solar" && L.solar.labels);
  const intro = document.getElementById("intro");
  if (intro) {
    intro.classList.add("gone"); intro.setAttribute("aria-hidden", "true");
    setTimeout(() => intro.remove(), 1200);
  }
  lastUser = performance.now();
  startAmbient();   // user gesture — autoplay-safe
  document.getElementById("scene").focus({ preventScroll: true });
  if (tour) { playTour(); return; }
  const c = L.solar.cam, controls = L.solar.controls;
  const duration = transitionDuration(3.4);
  S.tween = { t: 0, dur: duration, fromPos: c.position.clone(), toPos: new THREE.Vector3(0, 34, 78),
    fromTar: controls.target.clone(), toTar: new THREE.Vector3(0, 0, 0), cam: c, controls };
  showCameraRoute("Inner Solar System", duration);
}

function cam(fov, near, far, pos) {
  const c = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, near, far);
  c.position.set(...pos); return c;
}
function mk(c) { const o = new OrbitControls(c, renderer.domElement); o.enableDamping = true; o.dampingFactor = 0.06; return o; }

const STAR_TINTS = [[1.0,0.96,0.9],[0.75,0.83,1.0],[1.0,0.86,0.66],[0.92,0.95,1.0],[1.0,0.78,0.6]];
const HAZE_TINTS = [[0.55,0.66,1.0],[1.0,0.82,0.62],[0.72,0.6,1.0],[0.85,0.9,1.0]];
const gauss = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1; // ~N(0, .33)
// Backdrop starfield with a tilted Milky-Way band: ~55% of the stars hug a
// galactic plane (denser, colour-varied), plus large dim additive haze points
// that read as unresolved star-cloud glow along the band. Purely decorative.
function backdrop(count, radius) {
  const nBand = Math.floor(count * 0.55), nHaze = 150, total = count + nHaze;
  const p = new Float32Array(total * 3), c = new Float32Array(total * 3),
        s = new Float32Array(total), ph = new Float32Array(total);
  const tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.55, 0.2, 0.35));
  const v3 = new THREE.Vector3();
  const bandPos = () => {                       // point near the galactic plane
    const ang = Math.random() * Math.PI * 2;
    const r = radius * (0.72 + 0.28 * Math.random());
    v3.set(r * Math.cos(ang), gauss() * radius * 0.085, r * Math.sin(ang)).applyMatrix4(tilt);
    return v3;
  };
  for (let i = 0; i < total; i++) {
    const isHaze = i >= count, inBand = isHaze || i < nBand;
    if (inBand) { bandPos(); }
    else {
      const u = Math.random(), v = Math.random(), th = Math.acos(2 * v - 1), phi = 2 * Math.PI * u;
      const r = radius * (0.7 + 0.3 * Math.random());
      v3.set(r*Math.sin(th)*Math.cos(phi), r*Math.cos(th), r*Math.sin(th)*Math.sin(phi));
    }
    p[i*3] = v3.x; p[i*3+1] = v3.y; p[i*3+2] = v3.z;
    if (isHaze) {
      const t = HAZE_TINTS[(Math.random()*HAZE_TINTS.length)|0], b = 0.025 + Math.random()*0.045;
      c[i*3]=t[0]*b; c[i*3+1]=t[1]*b; c[i*3+2]=t[2]*b;
      s[i] = 30 + Math.random()*60;
      ph[i] = Math.random()*6.28;
      continue;
    }
    const t = STAR_TINTS[(Math.random()*STAR_TINTS.length)|0], b = 0.4 + Math.random()*0.9;
    c[i*3]=t[0]*b; c[i*3+1]=t[1]*b; c[i*3+2]=t[2]*b;
    s[i] = Math.random()<0.04 ? 2.6 : (0.8 + Math.random()*1.2);
    ph[i] = Math.random()*6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(c, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(s, 1));
  g.setAttribute("aPhase", new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aPhase; uniform float uTime;
      varying vec3 vC; varying float vT;
      void main(){ vC=aColor; vT=0.7+0.3*sin(uTime*1.5+aPhase);
        gl_PointSize=aSize; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vC; varying float vT;
      void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
        float a=smoothstep(0.5,0.0,d); a*=a;   // soft edges (large haze points too)
        gl_FragColor=vec4(vC*vT, a); }`,
  });
  starMats.push(mat);
  return new THREE.Points(g, mat);
}
const starMats = [];

// Parallax dust: particles live in a repeating cube that wraps around the
// camera (mod in the vertex shader), fading at the wrap edges — free depth
// cues whenever the camera moves. Purely decorative.
function addDust(scene, ext, count = 350, size = 26) {
  count = Math.max(24, Math.round(count * QUALITY.particleScale));
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) pos[i] = Math.random() * ext;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uExt: { value: ext }, uSize: { value: size } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uExt; uniform float uSize; varying float vA;
      void main(){
        vec3 p = mod(position - cameraPosition, uExt) - 0.5 * uExt + cameraPosition;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = length(mv.xyz);
        vA = smoothstep(uExt * 0.5, uExt * 0.18, d) * smoothstep(uExt * 0.01, uExt * 0.06, d);
        gl_PointSize = clamp(uSize / d, 1.0, 5.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(vec3(0.75, 0.85, 1.0), vA * 0.45 * smoothstep(0.5, 0.1, r)); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  scene.add(pts);
}

// ---- layer switching -------------------------------------------------------
// quick black dip that "reveals" the new layer — cinematic cut, skipped for
// reduced motion and on first paint (the boot splash covers it).
function crossfade() {
  const f = document.getElementById("fade");
  if (!f || S.reducedMotion) return;
  f.style.transition = "none"; f.style.opacity = "0.9";
  void f.offsetHeight;                                  // force reflow
  f.style.transition = "opacity .75s ease"; f.style.opacity = "0";
  whoosh(0.7);
}
let _layerInit = false;
function provenanceForLayer(key) {
  if (key === "exo") {
    const base = getProvenancePresentation(DATA?.exo?.provenance?.ingest_mode);
    return { ...base, label: `${base.shortLabel} values · derived orbital overlays`, shortLabel: "Mixed evidence",
      description: `${base.description} Habitable zones, display colours and orbital scene geometry are derived or illustrative.`, tone: "inferred" };
  }
  if (["nebula", "galaxies", "cmb"].includes(key)) {
    const data = { nebula: DATA?.nebula, galaxies: DATA?.galaxies, cmb: DATA?.cmb }[key];
    const p = data?.provenance || {};
    return { kind: p.source_type || "unknown", label: "Measured properties · illustrative render",
      shortLabel: "Mixed evidence", description: p.note || "Properties are measured; visible structure is an explicitly procedural prior.",
      tone: "illustrative", isObserved: p.source_type === "observed" };
  }
  if (key === "bh") {
    return { kind: "derived", label: "Measured EHT parameters · schematic render", shortLabel: "Mixed evidence",
      description: "Measured EHT angular scales and published physical parameters anchor a stylised schematic. It is not a GR ray-traced prediction or image reconstruction.",
      tone: "inferred", isObserved: true };
  }
  const mode = {
    solar: "derived",
    stars: manifest?.source_mode,
    cosmic: DATA?.cosmic?.source_mode,
    wh: "simulated",
  }[key];
  return getProvenancePresentation(mode);
}

const LAYER_TITLES = {
  solar: "Solar System", exo: "Exoplanet Systems", stars: "Stellar Field",
  nebula: "Nebulae", galaxies: "Resolved Galaxies", cosmic: "Cosmic Web",
  cmb: "First Light", bh: "Black-Hole Horizons", wh: "Wormhole Model",
};

function closeMobileDrawers() {
  document.body.classList.remove("info-open", "controls-open");
  document.getElementById("mobileInfoBtn")?.setAttribute("aria-expanded", "false");
  document.getElementById("mobileControlsBtn")?.setAttribute("aria-expanded", "false");
  const introActive = document.body.classList.contains("intro-active");
  for (const id of ["hud", "controlDeck"]) {
    const panel = document.getElementById(id);
    if (QUALITY.isMobile) { panel.setAttribute("aria-hidden", "true"); panel.setAttribute("inert", ""); }
    else {
      panel.removeAttribute("aria-hidden");
      if (introActive) panel.setAttribute("inert", "");
      else panel.removeAttribute("inert");
    }
  }
}

function setLayer(key) {
  const cfg = L[key];
  const changingLayer = _layerInit && key !== S.layer;
  const activationMark = `uep:layer:${key}-activation`;
  if (changingLayer && performance.getEntriesByName(activationMark).length === 0) {
    performance.mark(activationMark);
  }
  renderer.domElement.setAttribute("aria-busy", "true");
  try {
    cfg.ensure?.();
  } catch (error) {
    console.error(`Could not prepare ${key} layer`, error);
    document.getElementById("announcer").textContent = `${LAYER_TITLES[key]} could not be prepared.`;
    renderer.domElement.removeAttribute("aria-busy");
    return;
  }
  renderer.domElement.removeAttribute("aria-busy");
  if (_layerInit && key !== S.layer) { crossfade(); showCameraRoute(LAYER_TITLES[key], 0.9); }
  _layerInit = true;
  S.layer = key;
  if (changingLayer && performance.getEntriesByName(activationMark).length === 1
      && performance.getEntriesByName(`uep:layer:${key}-activation-to-painted`).length === 0) {
    pendingLayerPaint = { key, activationMark };
  }
  renderPass.scene = cfg.scene; renderPass.camera = cfg.cam;
  for (const k in L) L[k].controls.enabled = (k === key);
  bloom.threshold = cfg.bloom[0];
  bloom.enabled = QUALITY.bloom;
  bloom.strength = QUALITY.bloom ? cfg.bloom[1] : 0;

  document.querySelectorAll(".layer-btn").forEach(b => {
    const active = b.dataset.layer === key;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
    if (active && QUALITY.isMobile) b.scrollIntoView({ behavior: S.reducedMotion ? "auto" : "smooth", inline: "center", block: "nearest" });
  });
  ["solarControls", "exoControls", "starControls", "cosmicControls", "bhControls", "nebulaControls", "galaxyControls", "cmbControls", "whControls"].forEach(id =>
    document.getElementById(id).classList.toggle("hidden", id !== cfg.panel));
  document.getElementById("legend").classList.toggle("hidden", !cfg.legend);
  document.getElementById("inspector").classList.add("hidden");
  document.getElementById("labels").style.display = cfg.labels ? "block" : "none";
  document.getElementById("labels").style.opacity = key === "solar" && !S.solarLabels ? "0" : "1";
  S.follow = null;   // stop following when changing layers
  S.cruise = false;
  if (solar) solar.showLandmarksFor(null);
  // Hide CSS2D labels belonging to inactive scenes (they otherwise persist).
  for (const k in L) setSceneLabels(L[k].scene, k === key && cfg.labels);
  document.getElementById("layerName").textContent =
    { solar: "solar system", exo: "exoplanet systems", stars: "stellar neighbourhood",
      cosmic: "cosmic web", bh: "black holes", nebula: "nebulae", galaxies: "resolved galaxies",
      cmb: "cosmic microwave background", wh: "wormhole · theoretical" }[key];
  document.getElementById("layerDesc").textContent = DESCRIPTIONS[key];
  const title = LAYER_TITLES[key];
  const provenance = provenanceForLayer(key);
  document.getElementById("headerLayerName").textContent = title;
  document.getElementById("headerLayerMode").textContent = provenance.label;
  document.getElementById("controlLayerName").textContent = title;
  const evidence = document.getElementById("evidenceStatus");
  evidence.dataset.tone = provenance.tone === "observed" ? "measured" : provenance.tone;
  evidence.querySelector("b").textContent = provenance.shortLabel;
  evidence.title = provenance.description;
  document.getElementById("announcer").textContent = `${title}. ${provenance.label}.`;
  populateMeta();
  syncZoom();
  renderDataPanel();
  closeMobileDrawers();
}

function setSceneLabels(scene, show) {
  // Only reveal labels whose whole ancestor chain is visible — otherwise
  // landmark labels inside hidden groups leak through (CSS2DRenderer skips
  // invisible subtrees and never resets their DOM display).
  let shown = 0;
  scene.traverse((o) => {
    if (!o.element) return;
    let vis = show, n = o;
    while (vis && n) { vis = n.visible; n = n.parent; }
    if (vis && shown >= QUALITY.maxLabels) vis = false;
    if (vis) shown += 1;
    o.element.style.display = vis ? "" : "none";
  });
}

function populateMeta() {
  const starProv = getProvenancePresentation(manifest.source_mode);
  const exoProv = getProvenancePresentation(DATA.exo.provenance.ingest_mode);
  const cosmicProv = getProvenancePresentation(DATA.cosmic.source_mode);
  const rowsByLayer = {
    solar: [["Bodies", "8 planets · 5 dwarfs · 13 rendered moons"], ["Frame", "Heliocentric ecliptic"],
      ["Positions", "Keplerian (JPL)"], ["Provenance", "DERIVED · inferred"], ["Credit", "NASA/JPL SSD"]],
    bh: [["Objects", "Sgr A* · M87*"], ["Frame", "Local · Schwarzschild radii"],
      ["Imaging", "Event Horizon Telescope"], ["Render", "EHT-anchored SCHEMATIC"],
      ["Provenance", "OBSERVED parameters · DERIVED render"], ["Credit", "EHT Collaboration"]],
    nebula: [["Objects", `${DATA.nebula.objects.length} nebulae`], ["Frame", "Local · light-years"],
      ["Properties", "literature estimates"], ["Gas render", "PROCEDURAL"], ["Credit", "Literature + illustrative"]],
    galaxies: [["Objects", `${DATA.galaxies.objects.length} galaxies`], ["Frame", "Local · light-years"],
      ["Properties", "heterogeneous literature estimates"], ["Star render", "PROCEDURAL"], ["Credit", "Literature + illustrative"]],
    exo: [["Systems", DATA.exo.systems.length], ["Planets", DATA.exo.systems.reduce((a, s) => a + s.n_planets, 0)],
      ["Frame", "Per-system orbital plane"], ["Evidence", exoProv.label],
      ["Source release", DATA.exo.provenance.dataset_release], ["Credit", DATA.exo.provenance.credit]],
    stars: [["Sources", manifest.total_sources.toLocaleString()], ["Frame", "Galactic XYZ (pc)"],
      ["Cosmology", manifest.cosmology], ["Source release", manifest.dataset_release],
      ["UEP build", manifest.delivery_release],
      ["Data mode", starProv.label], ["Credit", manifest.credit]],
    cosmic: [["Galaxies", DATA.cosmic.count.toLocaleString()], ["Frame", "Comoving Mpc"],
      ["Cosmology", DATA.cosmic.cosmology], ["Distance", "redshift → Planck18"],
      ["Evidence", cosmicProv.label], ["Source release", DATA.cosmic.provenance.dataset_release],
      ["Credit", DATA.cosmic.provenance.credit]],
    cmb: [["Mean temperature", "2.725 K · OBSERVED"], ["Anisotropy amplitude", "OBSERVED"],
      ["Redshift / age / distance", "DERIVED · standard cosmology"],
      ["Pattern render", "PROCEDURAL · not the Planck sky map"], ["Credit", "Planck / WMAP / COBE"]],
    wh: [["Object", "Morris–Thorne traversable model"], ["Status", "THEORETICAL — never observed"],
      ["Frame", "Local · throat radii"], ["Provenance", "MODELLED · simulated"],
      ["Distinction", "Einstein–Rosen bridge is non-traversable"], ["Credit", "Morris–Thorne 1988"]],
  };
  document.getElementById("meta").innerHTML = rowsByLayer[S.layer].map(([k, v]) => row(k, v)).join("");
}

// ---- UI --------------------------------------------------------------------
function buildJumpButtons(data) {
  const wrap = document.getElementById("planetJump");
  const names = ["Sun", ...data.planets.filter(p => p.category !== "dwarf").map(p => p.name)];
  wrap.innerHTML = names.map(n => `<button type="button" data-body="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join("");
  wrap.querySelectorAll("button").forEach(b => b.addEventListener("click", () => flyToBody(b.dataset.body)));
}
function buildBHSelector() {
  const sel = document.getElementById("bhSelect");
  sel.innerHTML = bh.names().map((n, i) => `<option value="${i}">${escapeHtml(n)}</option>`).join("");
  sel.addEventListener("change", () => selectBH(parseInt(sel.value)));
  sel.value = String(bh.index);
  renderBHSummary(bh.index);
}
function selectBH(i) {
  if (bh.index !== i) bh.build(i);
  renderBHSummary(i);
}
function renderBHSummary(i) {
  const o = bh.objects[i];
  document.getElementById("bhSummary").innerHTML =
    `<b>${escapeHtml(o.long_name)}</b> — ${escapeHtml(o.facts.mass)} · ${escapeHtml(o.facts.distance)}<br>` +
    `Schwarzschild radius ≈ ${escapeHtml(o.schwarzschild_km.toLocaleString())} km`;
}
function buildNebulaSelector() {
  const sel = document.getElementById("nebulaSelect");
  sel.innerHTML = nebula.names().map((n, i) => `<option value="${i}">${escapeHtml(n)}</option>`).join("");
  sel.addEventListener("change", () => selectNebula(parseInt(sel.value)));
  sel.value = String(nebula.index);
  renderNebulaSummary(nebula.index);
}
function selectNebula(i) {
  if (nebula.index !== i) nebula.build(i);
  renderNebulaSummary(i);
}
function renderNebulaSummary(i) {
  const o = nebula.objects[i];
  document.getElementById("nebulaSummary").innerHTML =
    `<b>${escapeHtml(o.name)}</b> (${escapeHtml(o.catalogue)}) — ${escapeHtml(o.type)}<br>` +
    `${escapeHtml(o.distance_ly.toLocaleString())} ly away · ${escapeHtml(o.size_ly)} ly across`;
}
function buildGalaxySelector() {
  const sel = document.getElementById("galaxySelect");
  sel.innerHTML = galaxyL.names().map((n, i) => `<option value="${i}">${escapeHtml(n)}</option>`).join("");
  sel.addEventListener("change", () => selectGalaxy(parseInt(sel.value)));
  sel.value = String(galaxyL.index);
  renderGalaxySummary(galaxyL.index);
}
function selectGalaxy(i) {
  if (galaxyL.index !== i || galaxyL.field) galaxyL.build(i);
  renderGalaxySummary(i);
}
function renderGalaxySummary(i) {
  const o = galaxyL.objects[i];
  const dist = o.distance_mly === 0 ? "our galaxy" : `${o.distance_mly} Mly away`;
  document.getElementById("galaxySummary").innerHTML =
    `<b>${escapeHtml(o.name)}</b>${o.catalogue !== "—" ? " (" + escapeHtml(o.catalogue) + ")" : ""} — ${escapeHtml(o.type)}<br>` +
    `${escapeHtml(dist)} · ${escapeHtml((o.diameter_ly / 1000).toLocaleString())} kly across`;
}
function buildExoSelector() {
  const sel = document.getElementById("exoSystem");
  sel.innerHTML = exo.systemNames().map((n, i) => `<option value="${i}">${escapeHtml(n)}</option>`).join("");
  sel.addEventListener("change", () => selectExoSystem(parseInt(sel.value)));
  sel.value = String(exo.index);
  renderExoSummary(exo.index);
}
function selectExoSystem(i) {
  if (exo.index !== i) exo.buildSystem(i);
  renderExoSummary(i);
}
function renderExoSummary(i) {
  const s = exo.systems[i];
  const hz = s.hz_inner_au != null && s.hz_outer_au != null
    ? `Modelled HZ ${s.hz_inner_au}–${s.hz_outer_au} AU`
    : "HZ not constrained";
  document.getElementById("exoSummary").innerHTML =
    `<b>${escapeHtml(s.hostname)}</b> — ${escapeHtml(s.n_planets)} planets · ${escapeHtml(s.distance_pc ? s.distance_pc + " pc" : "distance n/a")}` +
    `${s.st_teff ? " · Teff " + escapeHtml(s.st_teff) + " K" : ""}<br>${escapeHtml(hz)}`;
}

function wireUI() {
  document.querySelectorAll(".layer-btn").forEach(b => b.addEventListener("click", () => setLayer(b.dataset.layer)));
  document.getElementById("playPause").addEventListener("click", (e) => {
    S.playing = !S.playing; e.currentTarget.textContent = S.playing ? "Pause time" : "Resume time";
  });
  document.getElementById("nowBtn").addEventListener("click", () => { S.jd = nowJD(); });
  const speed = document.getElementById("speed");
  speed.addEventListener("input", () => { S.speed = parseFloat(speed.value); updateSpeedLabel(); });
  updateSpeedLabel();
  document.getElementById("ssLabels").addEventListener("change", (e) => {
    S.solarLabels = e.target.checked;
    if (S.layer === "solar") document.getElementById("labels").style.opacity = e.target.checked ? "1" : "0";
  });
  document.getElementById("ssOrbits").addEventListener("change", (e) =>
    solar.planets.forEach(p => p.orbitLine.visible = e.target.checked));
  document.getElementById("ssBright").addEventListener("change", (e) => solar.setBrightMode(e.target.checked));
  document.getElementById("trueScale").addEventListener("change", (e) => {
    solar.setTrueScale(e.target.checked);
    solar.setBrightMode(document.getElementById("ssBright").checked);   // re-apply after rebuild
    document.getElementById("ssOrbits").dispatchEvent(new Event("change"));
  });
  document.getElementById("exoSpin").addEventListener("change", (e) => S.exoSpin = e.target.checked);
  document.getElementById("galaxyField").addEventListener("change", (e) => {
    if (!galaxyL) return;
    S.tween = null;
    if (e.target.checked) {
      galaxyL.buildField();
      document.getElementById("galaxyPickRow").classList.add("hidden");
      document.getElementById("galaxySummary").innerHTML = "All 7 galaxies shown together in 3-D. Detected central black holes have a golden marker; upper limits do not.";
      L.galaxies.cam.position.set(0, 70, 165); L.galaxies.controls.target.set(0, 0, 0);
    } else {
      document.getElementById("galaxyPickRow").classList.remove("hidden");
      selectGalaxy(parseInt(document.getElementById("galaxySelect").value || "1"));
      L.galaxies.cam.position.set(0, 30, 78); L.galaxies.controls.target.set(0, 0, 0);
    }
  });
  document.getElementById("toggleConfidence").addEventListener("change", (e) => stars?.setConfidenceColor(e.target.checked));
  document.getElementById("toggleUncertainty").addEventListener("change", () => stars?.clearUncertainty());
  document.getElementById("pointSize").addEventListener("input", (e) => stars?.setPointScale(parseFloat(e.target.value)));
  document.getElementById("galSize").addEventListener("input", (e) =>
    { if (cosmic) cosmic.points.material.uniforms.uScale.value = parseFloat(e.target.value); });
  document.getElementById("searchBtn").addEventListener("click", doSearch);
  document.getElementById("searchBox").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
  document.getElementById("closeInspector").addEventListener("click", () => {
    document.getElementById("inspector").classList.add("hidden"); stars?.clearUncertainty();
  });
  const toggleMobileDrawer = (kind) => {
    const bodyClass = `${kind}-open`;
    const button = document.getElementById(kind === "info" ? "mobileInfoBtn" : "mobileControlsBtn");
    const open = !document.body.classList.contains(bodyClass);
    closeMobileDrawers();
    if (open) {
      document.body.classList.add(bodyClass);
      button.setAttribute("aria-expanded", "true");
      const panel = document.getElementById(kind === "info" ? "hud" : "controlDeck");
      panel.removeAttribute("aria-hidden"); panel.removeAttribute("inert");
      setTimeout(() => document.querySelector(`#${kind === "info" ? "hud" : "controlDeck"} button, #${kind === "info" ? "hud" : "controlDeck"} input, #${kind === "info" ? "hud" : "controlDeck"} select`)?.focus(), 20);
    }
  };
  document.getElementById("mobileInfoBtn").addEventListener("click", () => toggleMobileDrawer("info"));
  document.getElementById("mobileControlsBtn").addEventListener("click", () => toggleMobileDrawer("controls"));
  document.getElementById("hudClose").addEventListener("click", closeMobileDrawers);
  document.getElementById("controlDeckClose").addEventListener("click", closeMobileDrawers);
  document.getElementById("surfaceBtn").addEventListener("click", flyToSurface);
  const us = document.getElementById("uniSearch");
  us.addEventListener("input", () => renderUniResults(searchUniverse(us.value)));
  us.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const hits = searchUniverse(us.value);
      if (hits.length) { hits[0].run(); clearUni(); }
      else resolveExternal(us.value.trim());
    } else if (e.key === "ArrowDown") {
      e.preventDefault(); document.querySelector("#uniResults .hit")?.focus();
    } else if (e.key === "Escape") { clearUni(); us.blur(); }
  });
  document.getElementById("tourBtn").addEventListener("click", () => S.tourActive ? stopTour() : playTour());
  document.getElementById("creditsBtn").addEventListener("click", (event) => showCredits(event.currentTarget));
  document.getElementById("closeCredits").addEventListener("click", () => closeDialog("credits"));
  document.getElementById("helpBtn").addEventListener("click", (event) => openDialog("help", event.currentTarget));
  document.getElementById("closeHelp").addEventListener("click", () => closeDialog("help"));
  document.getElementById("reducedMotion").addEventListener("change", (e) => setReducedMotion(e.target.checked));
  document.getElementById("dataBtn").addEventListener("click", toggleData);
  document.getElementById("closeData").addEventListener("click", toggleData);
  // light / dark interface theme (3-D space stays dark; panels switch)
  const themeBtn = document.getElementById("themeBtn");
  const applyTheme = (t) => {
    document.body.classList.toggle("light", t === "light");
    themeBtn.querySelector(".tool-icon").textContent = t === "light" ? "◒" : "◐";
    try { localStorage.setItem("uep-theme", t); } catch (_) {}
  };
  themeBtn.addEventListener("click", () =>
    applyTheme(document.body.classList.contains("light") ? "dark" : "light"));
  let savedTheme = "dark"; try { savedTheme = localStorage.getItem("uep-theme") || "dark"; } catch (_) {}
  applyTheme(savedTheme);
  // photo mode + ambient sound toggles
  document.getElementById("photoBtn").addEventListener("click", () => togglePhoto(true));
  document.getElementById("phSave").addEventListener("click", savePhoto);
  document.getElementById("phExit").addEventListener("click", () => togglePhoto(false));
  const soundBtn = document.getElementById("soundBtn");
  const applySound = (on) => {
    setAudioMuted(!on);
    soundBtn.querySelector(".tool-icon").textContent = on ? "◖" : "×";
    try { localStorage.setItem("uep-sound", on ? "on" : "off"); } catch (_) {}
  };
  soundBtn.addEventListener("click", () => applySound(soundBtn.querySelector(".tool-icon").textContent === "×"));
  let sPref = "on"; try { sPref = localStorage.getItem("uep-sound") || "on"; } catch (_) {}
  if (sPref === "off") { setAudioMuted(true); soundBtn.querySelector(".tool-icon").textContent = "×"; }
  addEventListener("keydown", onKey);
  // idle detection for the ambient camera drift
  ["pointerdown", "wheel", "keydown", "touchstart"].forEach(ev =>
    addEventListener(ev, () => { lastUser = performance.now(); }, { passive: true }));
  if (prefersReducedMotion) {
    document.getElementById("reducedMotion").checked = true; setReducedMotion(true);
  }
}

// ---- keyboard & accessibility ----------------------------------------------
function onKey(e) {
  if (activeModal) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDialog(activeModal.panel.id);
    } else if (e.key === "Tab") {
      trapModalFocus(e, activeModal.panel);
    }
    return;
  }
  if (e.defaultPrevented || e.isComposing || isInteractiveShortcutTarget(e.target)) return;
  const k = e.key;
  const num = { "1": "solar", "2": "exo", "3": "stars", "4": "nebula", "5": "galaxies", "6": "cosmic", "7": "cmb", "8": "bh", "9": "wh" };
  if (num[k]) { setLayer(num[k]); return; }
  switch (k.toLowerCase()) {
    case "arrowright": cycleLayer(1); break;
    case "arrowleft": cycleLayer(-1); break;
    case "t": document.getElementById("tourBtn").click(); break;
    case "c": showCredits(document.activeElement); break;
    case "d": toggleData(); break;
    case "?": openDialog("help", document.activeElement); break;
    case " ": e.preventDefault(); S.playing = !S.playing;
      { const b = document.getElementById("playPause"); if (b) b.textContent = S.playing ? "Pause time" : "Resume time"; } break;
    case "r": { const c = document.getElementById("reducedMotion"); c.checked = !c.checked; setReducedMotion(c.checked); } break;
    case "p": togglePhoto(); break;
    case "s": if (document.body.classList.contains("photo")) savePhoto(); break;
    case "escape":
      if (S.tourActive) stopTour();
      togglePhoto(false);
      closeMobileDrawers();
      document.getElementById("inspector").classList.add("hidden");
      break;
  }
}
function cycleLayer(d) {
  const i = (LAYER_ORDER.indexOf(S.layer) + d + LAYER_ORDER.length) % LAYER_ORDER.length;
  setLayer(LAYER_ORDER[i]);
}
function setReducedMotion(on) {
  S.reducedMotion = on;
  document.body.classList.toggle("reduce-motion", on);
  QUALITY = applyRendererConstraints(getQualityProfile({ viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio, reducedMotion: on }));
  if (renderer) renderer.setPixelRatio(QUALITY.pixelRatio);
  if (bloom) { bloom.enabled = QUALITY.bloom; bloom.strength = QUALITY.bloom ? L[S.layer].bloom[1] : 0; }
  if (on) {
    S.playing = false;
    const b = document.getElementById("playPause"); if (b) b.textContent = "Resume time";
    if (S.tween) {
      S.tween.cam.position.copy(S.tween.toPos);
      S.tween.controls.target.copy(S.tween.toTar);
      S.tween = null;
    }
    hideCameraRoute();
  }
}

// ---- universal search ------------------------------------------------------
function buildUniverseIndex(data) {
  const idx = [];
  const add = (keys, label, layer, run) =>
    idx.push({ keys: keys.filter(Boolean).map(k => String(k).toLowerCase()), label, layer, run });

  add(["sun", "sol"], "Sun", "solar", () => { setLayer("solar"); selectAndShowSolar("Sun"); });
  data.solar.planets.forEach((planet) =>
    add([planet.name], planet.name, planet.category === "dwarf" ? "dwarf planet" : "planet",
      () => { setLayer("solar"); selectAndShowSolar(planet.name); }));
  data.exo.systems.forEach((s, i) => {
    add([s.hostname], `${s.hostname} — ${s.n_planets} planets`, "exoplanets",
      () => { setLayer("exo"); document.getElementById("exoSystem").value = i; selectExoSystem(i); });
    s.planets.forEach((planet) =>
      add([planet.name], planet.name, "exoplanet", () => {
        setLayer("exo");
        document.getElementById("exoSystem").value = i;
        selectExoSystem(i);
        showExoInfo({ kind: "planet", data: { ...planet, host: s.hostname } });
      }));
  });
  data.nebula.objects.forEach((o, i) =>
    add([o.name, o.catalogue], `${o.name} (${o.catalogue})`, "nebula",
      () => { setLayer("nebula"); document.getElementById("nebulaSelect").value = i; selectNebula(i); }));
  data.galaxies.objects.forEach((o, i) =>
    add([o.name, o.catalogue], `${o.name}${o.catalogue !== "—" ? " (" + o.catalogue + ")" : ""}`, "galaxy",
      () => { setLayer("galaxies"); const c = document.getElementById("galaxyField");
        if (c.checked) { c.checked = false; c.dispatchEvent(new Event("change")); }
        document.getElementById("galaxySelect").value = i; selectGalaxy(i);
        showGalaxyInfo({ kind: "galaxy", data: o }); }));
  data.bh.objects.forEach((o, i) =>
    add([o.name, o.long_name], `${o.long_name}`, "black hole",
      () => { setLayer("bh"); document.getElementById("bhSelect").value = i; selectBH(i); }));
  add(["cmb", "cosmic microwave background", "big bang", "last scattering"],
    "Cosmic Microwave Background", "cosmology", () => setLayer("cmb"));
  add(["wormhole", "einstein-rosen", "einstein rosen bridge", "morris-thorne"],
    "Wormhole (theoretical)", "spacetime", () => setLayer("wh"));
  for (let i = 0; i < data.stars.count; i++) {
    const n = data.stars.name[i];
    if (n) add([n], `${n}`, "star", () => { setLayer("stars"); showStarInfo(i); });
  }
  return idx;
}
function selectAndShowSolar(name) {
  const rec = solar.byName[name];
  flyToBody(name);
  if (rec) showSolarInfo(rec.surf.userData, rec.surf);
  else if (name === "Sun" && solar.sunMesh) showSolarInfo(solar.sunMesh.userData, solar.sunMesh);
}
function searchUniverse(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const exact = [], starts = [], incl = [];
  for (const e of UNI_INDEX) {
    let best = 3;
    for (const k of e.keys) {
      if (k === q) best = Math.min(best, 0);
      else if (k.startsWith(q)) best = Math.min(best, 1);
      else if (k.includes(q)) best = Math.min(best, 2);
    }
    if (best === 0) exact.push(e); else if (best === 1) starts.push(e); else if (best === 2) incl.push(e);
  }
  return [...exact, ...starts, ...incl].slice(0, 8);
}
function renderUniResults(hits) {
  const box = document.getElementById("uniResults");
  box.innerHTML = hits.map((h, i) =>
    `<button type="button" role="option" aria-selected="${i === 0}" class="hit${i === 0 ? " sel" : ""}" data-i="${UNI_INDEX.indexOf(h)}"><span>${escapeHtml(h.label)}</span><span class="lyr">${escapeHtml(h.layer)}</span></button>`).join("");
  box.querySelectorAll(".hit").forEach(el => el.addEventListener("click", () => {
    const e = UNI_INDEX[+el.dataset.i]; if (e) { e.run(); clearUni(); }
  }));
  document.getElementById("uniSearch").setAttribute("aria-expanded", String(hits.length > 0));
}
function clearUni() {
  document.getElementById("uniResults").innerHTML = "";
  const input = document.getElementById("uniSearch");
  input.value = "";
  input.setAttribute("aria-expanded", "false");
}
async function resolveExternal(q) {
  if (!q) return;
  const box = document.getElementById("uniResults");
  box.innerHTML = `<div class="hit"><span>Resolving “${escapeHtml(q)}” via SIMBAD/NED…</span></div>`;
  try {
    const r = await fetchJSON(`${API}/api/resolve?name=${encodeURIComponent(q)}`);
    openInspector(r.name, `${r.object_type || "object"} · resolved by ${r.archive.toUpperCase()}`);
    document.getElementById("objTable").innerHTML =
      row("Resolved by", r.archive.toUpperCase()) +
      (r.ra_deg != null ? row("RA", `${r.ra_deg.toFixed(3)}°`) : "") +
      (r.dec_deg != null ? row("Dec", `${r.dec_deg.toFixed(3)}°`) : "") +
      (r.object_type ? row("Type", r.object_type) : "") +
      (r.aliases && r.aliases.length ? row("Aliases", `${r.aliases.length}`) : "");
    document.getElementById("objNote").textContent =
      "Identity resolved from the federated archives — not in the 3-D scene, so coordinates only.";
    document.getElementById("objCredit").textContent = "Credit: " + (r.credit || "");
    clearUni();
  } catch (e) {
    box.innerHTML = `<div class="hit"><span>No match for “${escapeHtml(q)}”. Try a planet, star, galaxy, M-number or NGC id.</span></div>`;
  }
}

// ---- guided tour -----------------------------------------------------------
function exoIndex(host) { const i = DATA.exo.systems.findIndex(s => s.hostname === host); return i < 0 ? 0 : i; }
const TOUR = [
  { layer: "solar", cap: "Welcome. This is home — our Solar System, built from NASA/JPL orbital data and real planet imagery.", dur: 6500 },
  { layer: "solar", cap: "Earth: the only world we know to harbour life. Watch the city lights on its night side.", enter: () => flyToBody("Earth"), dur: 8000 },
  { layer: "solar", cap: "Saturn, wrapped in its rings of ice and rock — and a family of moons.", enter: () => flyToBody("Saturn"), dur: 8000 },
  { layer: "stars", cap: "Beyond the Sun, the stellar field shows Gaia measurements when available and clearly marks the illustrative offline fallback.", dur: 7500 },
  { layer: "exo", cap: "Many stars host their own worlds. This curated view identifies measured archive values and the habitable-zone bounds derived from them.", enter: () => selectExoSystem(exoIndex("TRAPPIST-1")), dur: 8000 },
  { layer: "nebula", cap: "Stars are born inside vast clouds of gas — nebulae like Orion, a stellar nursery 1,344 light-years away.", enter: () => selectNebula(0), dur: 8000 },
  { layer: "galaxies", cap: "Our Sun is one of billions of stars in the Milky Way — itself just one galaxy among countless others.", enter: () => { const c = document.getElementById("galaxyField"); if (!c.checked) { c.checked = true; c.dispatchEvent(new Event("change")); } }, dur: 9000 },
  { layer: "bh", cap: "At the heart of nearly every galaxy lurks a supermassive black hole, like Sagittarius A* at our own centre.", enter: () => selectBH(0), dur: 8500 },
  { layer: "cosmic", cap: "Zoom out far enough and galaxies trace large-scale structure. This layer identifies whether the field is measured 2MRS data or the procedural offline fallback.", dur: 9000 },
  { layer: "cmb", cap: "And at the very edge of what we can see: the cosmic microwave background — the universe's first light, 13.8 billion years old.", dur: 9000 },
  { layer: "solar", cap: "From a single planet to the dawn of the cosmos — measured, inferred, and modelled, always telling you which. Enjoy exploring.", dur: 8000 },
];
let tourTimer = null, tourIdx = 0;
function playTour() {
  S.tourActive = true; tourIdx = 0;
  document.body.classList.add("cinema");     // letterbox + dimmed panels
  const b = document.getElementById("tourBtn"); b.textContent = "■ Stop tour"; b.classList.add("live");
  runTourStop();
}
function runTourStop() {
  if (!S.tourActive) return;
  if (tourIdx >= TOUR.length) { stopTour(); return; }
  const s = TOUR[tourIdx];
  setLayer(s.layer);
  if (s.enter) setTimeout(() => { try { s.enter(); } catch (e) { console.warn(e); } }, 150);
  showCaption(s.cap, tourIdx + 1, TOUR.length);
  tourTimer = setTimeout(() => { tourIdx++; runTourStop(); }, s.dur);
}
function stopTour() {
  S.tourActive = false; if (tourTimer) clearTimeout(tourTimer); tourTimer = null;
  document.body.classList.remove("cinema");
  const b = document.getElementById("tourBtn"); b.textContent = "▶ Guided tour"; b.classList.remove("live");
  document.getElementById("caption").classList.add("hidden");
}
function showCaption(text, step, total) {
  document.getElementById("captionStep").textContent = `Guided tour · ${step} / ${total}`;
  document.getElementById("captionText").textContent = text;
  document.getElementById("caption").classList.remove("hidden");
}

// ---- data inspection (charts) ----------------------------------------------
function toggleData() {
  S.dataOpen = !S.dataOpen;
  document.getElementById("datapanel").classList.toggle("hidden", !S.dataOpen);
  document.getElementById("dataBtn").classList.toggle("live", S.dataOpen);
  document.getElementById("zoom").classList.toggle("hidden", S.dataOpen);  // avoid left-side overlap
  if (S.dataOpen) renderDataPanel();
}
function renderDataPanel() {
  if (!S.dataOpen) return;
  const canvas = document.getElementById("dataCanvas");
  const title = document.getElementById("dataTitle"), cap = document.getElementById("dataCaption");
  if (S.layer === "stars") {
    title.textContent = "Hertzsprung–Russell diagram";
    drawHR(canvas, DATA.stars, S.selStar);
    const p = getProvenancePresentation(manifest.source_mode);
    cap.textContent = `${DATA.stars.count.toLocaleString()} ${p.isObserved ? "Gaia catalogue" : "illustrative sample"} stars · colour vs absolute magnitude. ${p.label}.`;
    canvas.setAttribute("aria-label", `Hertzsprung–Russell diagram for ${DATA.stars.count} stars. ${p.label}.`);
  } else if (S.layer === "exo") {
    title.textContent = "Transit light curve";
    const r = drawTransit(canvas, S.selExoPlanet, DATA.exo.systems[exo?.index ?? 0]);
    cap.textContent = r ? `Modelled transit: depth ≈ ${r.depthPpm.toLocaleString()} ppm · duration ≈ ${r.durHours.toFixed(1)} h — DERIVED from the measured planet/star radii and orbital period.`
      : "Click a planet in the scene to model its transit dip.";
  } else if (S.layer === "cosmic") {
    title.textContent = "Redshift distribution";
    drawRedshift(canvas, DATA.cosmic);
    const p = getProvenancePresentation(DATA.cosmic.source_mode);
    cap.textContent = `${DATA.cosmic.count.toLocaleString()} galaxies · ${p.description}`;
    canvas.setAttribute("aria-label", `Redshift distribution for ${DATA.cosmic.count} galaxies. ${p.label}.`);
  } else {
    title.textContent = "Data inspection";
    const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height);
    cap.textContent = "Charts available in the Stellar (HR diagram), Exoplanet (transit) and Cosmic Web (redshift) layers.";
  }
}

// ---- credits / acknowledgement ledger --------------------------------------
const CREDITS = [
  ["Stars (Gaia DR3)", "ESA/Gaia/DPAC. This work has made use of data from the ESA mission Gaia, processed by the Gaia Data Processing and Analysis Consortium. CC BY-SA 3.0 IGO."],
  ["Offline stellar fallback", "UEP procedural star sample v1 (CC0 synthetic), displayed only when Gaia is not used."],
  ["Solar System ephemerides & bodies", "NASA/JPL Solar System Dynamics — approximate Keplerian elements and body parameters."],
  ["Planet / Moon / Sun textures", "NASA-derived maps via threejs.org (Earth, Moon) and the threex.planets project (other planets, Sun, Saturn ring)."],
  ["Exoplanets", "NASA Exoplanet Archive (NExScI/Caltech), operated under contract with NASA. Offline mode uses a scoped, explicitly labelled bundled snapshot."],
  ["Galaxy redshifts (cosmic web)", "2MASS Redshift Survey (Huchra et al. 2012), via VizieR/CDS, Strasbourg."],
  ["Resolved galaxies & central-object constraints", "Parameters and detections or upper limits are from the published literature; 3-D star distributions are illustrative procedural priors."],
  ["Black holes (Sgr A*, M87*)", "Event Horizon Telescope Collaboration (2019, 2022). The render is an EHT-anchored schematic, not a ray-traced prediction or image reconstruction."],
  ["Nebulae", "Distances/sizes from the literature; volumetric gas rendering is an illustrative procedural prior."],
  ["Cosmic microwave background", "Mean temperature and anisotropy constraints: Planck Collaboration / WMAP / COBE. Redshift, age and distance are cosmology-derived; the displayed pattern is procedural, not the measured Planck sky map."],
  ["Wormhole model", "Morris–Thorne traversable-wormhole geometry (1988), distinct from the non-traversable Einstein–Rosen bridge (1935). The entire scene is theoretical."],
  ["Cosmology", "Distances use the Planck 2018 (Planck18) cosmology via Astropy."],
];
const MODAL_FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function modalFocusableElements(panel) {
  return [...panel.querySelectorAll(MODAL_FOCUSABLE)].filter((element) =>
    element instanceof HTMLElement
    && element.getAttribute("aria-hidden") !== "true"
    && element.getClientRects().length > 0);
}

function trapModalFocus(event, panel) {
  const focusable = modalFocusableElements(panel);
  if (!focusable.length) {
    event.preventDefault();
    panel.tabIndex = -1;
    panel.focus();
    return;
  }
  const first = focusable[0], last = focusable[focusable.length - 1];
  const current = document.activeElement;
  if (event.shiftKey && (current === first || !panel.contains(current))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (current === last || !panel.contains(current))) {
    event.preventDefault(); first.focus();
  }
}

function openDialog(id, trigger = document.activeElement) {
  const panel = document.getElementById(id);
  if (!panel || panel.getAttribute("aria-modal") !== "true") return;
  if (activeModal?.panel === panel) return;
  if (activeModal) closeDialog(activeModal.panel.id, false);

  closeMobileDrawers();
  document.body.classList.add("modal-open");
  panel.classList.remove("hidden");
  const inertStates = [];
  for (const element of document.body.children) {
    if (element === panel) continue;
    inertStates.push({ element, wasInert: element.hasAttribute("inert") });
    element.setAttribute("inert", "");
  }
  activeModal = {
    panel,
    trigger: trigger instanceof HTMLElement ? trigger : null,
    inertStates,
  };
  modalFocusableElements(panel)[0]?.focus();
}

function closeDialog(id, restoreFocus = true) {
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.classList.add("hidden");
  if (activeModal?.panel !== panel) return;

  const { trigger, inertStates } = activeModal;
  activeModal = null;
  document.body.classList.remove("modal-open");
  for (const { element, wasInert } of inertStates) {
    if (wasInert) element.setAttribute("inert", "");
    else element.removeAttribute("inert");
  }
  if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
}

function showCredits(trigger = document.activeElement) {
  const active = provenanceForLayer(S.layer);
  document.getElementById("creditsBody").innerHTML =
    `<div class="src"><b>Active layer · ${escapeHtml(LAYER_TITLES[S.layer])}</b><div>${escapeHtml(active.description)}</div></div>` +
    CREDITS.map(([t, d]) =>
    `<div class="src"><b>${t}</b><div>${d}</div></div>`).join("");
  openDialog("credits", trigger);
}

function updateSpeedLabel() {
  const r = speedDaysPerSec(), a = Math.abs(r), sign = r < 0 ? "−" : "";
  document.getElementById("speedVal").textContent = a < 1 ? `${sign}${(a*24).toFixed(1)} h/s`
    : a < 365 ? `${sign}${a.toFixed(0)} d/s` : `${sign}${(a/365.25).toFixed(1)} yr/s`;
}
function speedDaysPerSec() { const v = S.speed, a = Math.abs(v); return a < 0.1 ? 0 : Math.sign(v) * Math.pow(10, a) / 8; }

// ---- picking & inspectors --------------------------------------------------
function onPick(ev) {
  S.pointer.x = (ev.clientX / innerWidth) * 2 - 1;
  S.pointer.y = -(ev.clientY / innerHeight) * 2 + 1;
  const cfg = L[S.layer];
  S.raycaster.setFromCamera(S.pointer, cfg.cam);
  S.raycaster.params.Points.threshold = S.layer === "cosmic" ? 3.0 : 4.0;
  const hits = S.raycaster.intersectObjects(cfg.pickables(), false);
  if (hits.length) cfg.pick(hits[0]);
}

function openInspector(name, type) {
  document.getElementById("inspector").classList.remove("hidden");
  document.getElementById("objName").textContent = name;
  document.getElementById("objType").textContent = type;
  document.getElementById("surfaceBtn").classList.add("hidden");   // default off
  showLower3(name, type);
  // deep-knowledge block: story · did-you-know · sense of scale
  const k = lookupKnowledge(name), story = document.getElementById("objStory");
  story.innerHTML = !k ? "" :
    `<div class="k-story">${k.story}</div>` +
    (k.dyk ? `<div class="k-dyk"><span>💡 Did you know</span>${k.dyk}</div>` : "") +
    (k.scale ? `<div class="k-scl"><span>⚖ Sense of scale</span>${k.scale}</div>` : "");
}

// Documentary-style lower-third title whenever an object is selected.
let l3Timer = null;
function showLower3(name, type) {
  const el = document.getElementById("lower3");
  if (!el) return;
  document.getElementById("l3name").textContent = name;
  document.getElementById("l3type").textContent = type;
  el.classList.add("show");
  clearTimeout(l3Timer);
  l3Timer = setTimeout(() => el.classList.remove("show"), 3400);
}

function showCameraRoute(destination, durationSeconds = 1.4) {
  if (S.reducedMotion) return;
  const overlay = document.getElementById("routeOverlay");
  const callout = document.getElementById("routeCallout");
  document.getElementById("routeDestination").textContent = destination;
  overlay.classList.remove("active");
  void overlay.getBoundingClientRect();
  overlay.classList.add("active");
  callout.classList.add("show");
  clearTimeout(routeTimer);
  routeTimer = setTimeout(hideCameraRoute, Math.max(900, durationSeconds * 1000 + 260));
}

function hideCameraRoute() {
  document.getElementById("routeOverlay")?.classList.remove("active");
  document.getElementById("routeCallout")?.classList.remove("show");
  clearTimeout(routeTimer);
  routeTimer = null;
}

// ---- photo mode (hide the interface for a clean frame) ---------------------
function togglePhoto(on) {
  const en = (on !== undefined) ? on : !document.body.classList.contains("photo");
  document.body.classList.toggle("photo", en);
}
function savePhoto() {
  renderActiveFrame();   // fresh frame in the same tick so toBlob captures it
  renderer.domElement.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "universe-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}

function renderActiveFrame() {
  if (SOFTWARE_RENDERER) renderer.render(L[S.layer].scene, L[S.layer].cam);
  else composer.render();
}

function showLandmarkInfo(ud) {
  const lm = ud.data;
  openInspector(lm.name, "surface landmark · " + lm.type);
  document.getElementById("objTable").innerHTML =
    row("Type", lm.type) + row("Latitude", `${lm.lat.toFixed(2)}°`) + row("Longitude", `${lm.lon.toFixed(2)}°`);
  document.getElementById("objNote").textContent = lm.info;
  document.getElementById("objCredit").textContent = "Surface landmark — approximate position, for orientation & education.";
}

function showSolarInfo(ud, obj) {
  if (ud.kind === "landmark") { showLandmarkInfo(ud); return; }   // stays in surface view
  const d = ud.data, f = d.facts || {};
  openInspector(d.name, ud.kind === "moon" ? `moon of ${d.parent}` : ud.kind);
  // configure the "Surface view" button for this body
  const btn = document.getElementById("surfaceBtn");
  if (ud.kind === "planet" || ud.kind === "moon" || ud.kind === "sun") {
    if (ud.kind === "moon" && obj) {
      // use the moon's real scene radius so small moons frame up close
      S.surface = { get: () => obj.getWorldPosition(new THREE.Vector3()),
        radius: Math.max(ud.sceneR || 0.35, 0.1), follow: null, name: d.name };
    } else if (ud.kind === "sun") {
      S.surface = { get: () => new THREE.Vector3(), radius: (solar.byName[d.name]?.sceneR) || 3.2, follow: null, name: d.name };
    } else {
      const rec = solar.byName[d.name];
      S.surface = { get: () => (rec ? rec.worldPos || rec.group.position : new THREE.Vector3()),
                    radius: rec ? rec.sceneR : 1, follow: d.name, name: d.name };
    }
    btn.classList.remove("hidden");
  }
  let rows = row("Provenance", evidenceBadge("derived", "DERIVED"));
  if (ud.kind === "planet") {
    rows += row("Distance", `${d.distance_au} AU`) + row("Radius", `${d.radius_km.toLocaleString()} km`) +
      row("Axial tilt", `${d.tilt_deg}°`);
    for (const [k, v] of Object.entries(f)) if (k !== "note") rows += row(k.replace(/_/g, " "), v);
  } else if (ud.kind === "moon") {
    rows += row("Parent", d.parent) + row("Radius", `${d.radius_km.toLocaleString()} km`) +
      row("Orbit radius", `${d.a_km.toLocaleString()} km`) + row("Orbital period", `${Math.abs(d.period_days)} days`);
  } else {
    rows += row("Radius", `${d.radius_km.toLocaleString()} km`);
    for (const [k, v] of Object.entries(f)) if (k !== "note") rows += row(k.replace(/_/g, " "), v);
  }
  document.getElementById("objTable").innerHTML = rows;
  document.getElementById("objNote").textContent = f.note || "";
  document.getElementById("objCredit").textContent = "Positions: JPL Keplerian model. Body data: NASA/JPL Solar System Dynamics.";
  // Fly to a planet/Sun when first selected — but if it's already the body we're
  // following (e.g. you're in its surface view), just keep showing the info.
  if (ud.kind !== "moon" && d.name !== S.follow) flyToBody(d.name);
}

function showExoInfo(ud) {
  const d = ud.data;
  const source = getProvenancePresentation(DATA.exo.provenance.ingest_mode);
  const badgeTone = source.isObserved ? "observed" : source.kind;
  if (ud.kind === "star") {
    openInspector(d.hostname, "host star");
    document.getElementById("objTable").innerHTML =
      row("Dataset", evidenceBadge(badgeTone, source.shortLabel)) +
      row("Distance", d.distance_pc ? `${d.distance_pc} pc` : "—") +
      row("Temperature", d.st_teff ? `${d.st_teff} K` : "—") +
      row("Radius", d.st_rad_sun ? `${d.st_rad_sun} R☉` : "—") +
      row("Planets", d.n_planets) +
      row("Habitable zone", d.hz_inner_au != null && d.hz_outer_au != null
        ? taggedValue(`${d.hz_inner_au}–${d.hz_outer_au} AU`, "derived", "MODELLED")
        : "Unknown — insufficient stellar inputs");
    document.getElementById("objNote").textContent = "";
  } else {
    // Proxima b is a radial-velocity detection and has no measured radius.
    // Reject legacy payloads that accidentally placed its minimum mass in the
    // radius field rather than repeating that scientific error in the UI.
    const radiusEarth = d.name === "Proxima Cen b" ? null : d.radius_earth;
    const massProvenance = String(d.mass_provenance || "").toLowerCase();
    const isMinimumMass = /msini|m sin i|minimum/.test(massProvenance);
    const massRow = d.mass_earth != null
      ? row(isMinimumMass ? "Minimum mass" : "Mass",
        taggedValue(`${d.mass_earth} M⊕${isMinimumMass ? " (M sin i)" : ""}`, "observed", "MEASURED"))
      : row("Mass", "Unknown — not reported");
    const hzState = d.in_hz === true
      ? "Yes — within the modelled conservative bounds"
      : d.in_hz === false
        ? "No — outside the modelled conservative bounds"
        : "Unknown — insufficient inputs";
    openInspector(d.name, `planet · orbits ${d.host}`);
    document.getElementById("objTable").innerHTML =
      row("Dataset", evidenceBadge(badgeTone, source.shortLabel)) +
      row("Radius", radiusEarth != null ? `${radiusEarth} R⊕` : "Unknown — not measured") +
      massRow +
      row("Orbital period", d.period_days != null ? `${d.period_days} days` : "Unknown") +
      row("Distance from star", d.sma_au != null ? `${d.sma_au} AU` : "Unknown") +
      row("Equilibrium temp", d.eq_temp_k != null
        ? taggedValue(`${d.eq_temp_k} K`, "derived", "MODELLED")
        : "Unknown — model inputs incomplete") +
      row("In habitable zone", hzState);
    document.getElementById("objNote").textContent = d.in_hz === true
      ? "The orbit lies within modelled conservative bounds; this does not establish surface liquid water or habitability."
      : d.in_hz == null
        ? "Habitable-zone membership cannot be determined from the available stellar and orbital inputs."
        : "Habitable-zone placement is model-derived and does not by itself determine habitability.";
    S.selExoPlanet = d; if (S.dataOpen) renderDataPanel();
  }
  document.getElementById("objCredit").textContent =
    `Credit: ${DATA.exo.provenance.credit}. ${source.description} Planet mass provenance is reported per record; equilibrium temperatures and habitable-zone bounds are model-derived.`;
}

async function showStarInfo(i) {
  const sid = stars.data.source_id[i];
  let rec;
  try { rec = await fetchJSON(`${API}/api/object/${sid}`); }
  catch (_) {
    rec = { source_id: sid, name: stars.data.name[i], distance_pc: stars.data.distance_pc[i],
      distance_unc_pc: stars.data.distance_unc_pc[i], phot_g_mean_mag: stars.data.mag[i],
      provenance: { source_type: stars.data.source_type[i], confidence: stars.data.confidence[i],
        distance_method: "parallax", dataset_release: manifest.dataset_release, credit: manifest.credit } };
  }
  const p = rec.provenance, unc = rec.distance_unc_pc;
  const bp = stars.data.bp_rp[i];
  const teff = tempFromBpRp(bp), spec = spectralClass(teff);
  const absM = rec.distance_pc > 0 ? rec.phot_g_mean_mag - 5 * Math.log10(rec.distance_pc) + 5 : null;
  const ly = rec.distance_pc * 3.262;
  const source = getProvenancePresentation(manifest.source_mode);
  openInspector(rec.name || rec.source_id, `star · ${source.shortLabel.toLowerCase()} field`);
  document.getElementById("objTable").innerHTML =
    row("Provenance", evidenceBadge(p.confidence, p.source_type)) +
    row("Distance", `${rec.distance_pc.toFixed(2)} pc (${ly.toFixed(1)} ly)${unc != null ? " ± " + unc.toFixed(2) : ""}`) +
    (spec ? row("Spectral type", `${spec} (estimated)`) : "") +
    (teff ? row("Est. temperature", `${teff.toLocaleString()} K`) : "") +
    (bp != null ? row("Colour (BP−RP)", bp.toFixed(2)) : "") +
    row("Apparent mag (G)", rec.phot_g_mean_mag.toFixed(2)) +
    (absM != null ? row("Absolute mag", absM.toFixed(2)) : "") +
    row("Source ID", rec.source_id) +
    row("Distance method", p.distance_method);
  const fact = STAR_FACTS[rec.name];
  document.getElementById("objNote").textContent = fact ? `${fact.con} — ${fact.note}` : "";
  document.getElementById("objCredit").textContent = "Credit: " + (p.credit || manifest.credit) +
    (manifest.acknowledgement ? " — " + manifest.acknowledgement : "");
  stars.drawUncertainty(i, unc, L.stars.cam, document.getElementById("toggleUncertainty").checked);
  const t = stars.flyTargetIndex(i); flyTo(t.position, t.radius, L.stars.cam, L.stars.controls);
  S.selStar = i; if (S.dataOpen) renderDataPanel();
}

function showCosmicInfo(i) {
  const info = cosmic.infoAt(i);
  const source = getProvenancePresentation(cosmic.data.source_mode);
  openInspector("Galaxy field point", source.label);
  const comovingMly = info.dist_mpc * 3.262;
  document.getElementById("objTable").innerHTML =
    row("Dataset", evidenceBadge(source.isObserved ? "observed" : source.kind, source.shortLabel)) +
    row("Redshift z", info.z.toFixed(5)) +
    row("Comoving distance", `${info.dist_mpc.toFixed(1)} Mpc`) +
    row("Comoving distance (converted)", `${comovingMly.toFixed(0)} million light-years`) +
    row(source.isObserved ? "Recession" : "Hubble proxy", `${(info.z * 299792).toFixed(0)} km/s`);
  document.getElementById("objNote").textContent =
    source.isObserved
      ? "Redshift is measured; distance is derived from it via the Planck18 cosmology."
      : "This is a procedural fallback point. Its redshift and distance are model values, not measurements.";
  document.getElementById("objCredit").textContent =
    `Credit: ${cosmic.data.provenance.credit}. ${source.description}`;
}

function galaxyPick(h) {
  const ud = h.object.userData;
  if (ud.kind === "galaxy_bh") showGalaxyBHInfo(ud);
  else showGalaxyInfo(ud);
}
function showCMBInfo() {
  const f = DATA.cmb.facts;
  openInspector("Cosmic Microwave Background", "surface of last scattering");
  document.getElementById("objTable").innerHTML =
    row("Mean temperature", taggedValue(f.temperature, "observed", "OBSERVED")) +
    row("Anisotropy amplitude", taggedValue(f.anisotropy_rms, "observed", "OBSERVED")) +
    row("Redshift", taggedValue(f.redshift, "derived", "MODEL-DERIVED")) +
    row("Age at emission", taggedValue(f.emitted, "derived", "MODEL-DERIVED")) +
    row("Light-travel time", taggedValue(f.light_travel, "derived", "MODEL-DERIVED")) +
    row("Comoving distance", taggedValue(f.comoving_distance, "derived", "MODEL-DERIVED")) +
    row("Pattern render", evidenceBadge("illustrative", "PROCEDURAL"));
  document.getElementById("objNote").textContent = `${f.note} Redshift, age and distance depend on the declared standard cosmological model.`;
  document.getElementById("objCredit").textContent = `Credit: ${DATA.cmb.provenance.credit}`;
}

function showGalaxyBHInfo(ud) {
  const bh = ud.data;
  if (centralBlackHoleIsUpperLimit(bh)) {
    const upper = bh.mass_upper_limit_msun ?? bh.mass_msun;
    openInspector(bh.name, `central-object constraint · ${ud.galaxy}`);
    document.getElementById("objTable").innerHTML =
      row("Type", evidenceBadge("observed", "NON-DETECTION")) +
      row("Host galaxy", ud.galaxy) +
      row("Mass upper limit", upper != null ? `< ${Number(upper).toLocaleString()} M☉` : "Published upper limit");
    document.getElementById("objNote").textContent = bh.note || "No central black hole was detected; the reported mass is an upper limit.";
    document.getElementById("objCredit").textContent =
      "Credit: central-object constraint from the published literature. No black-hole marker is rendered for a non-detection.";
    return;
  }
  openInspector(bh.name, `central black hole · ${ud.galaxy}`);
  const msun = bh.mass_msun >= 1e6 ? `${(bh.mass_msun / 1e6).toLocaleString()} million M☉`
    : `${bh.mass_msun.toLocaleString()} M☉`;
  document.getElementById("objTable").innerHTML =
    row("Type", evidenceBadge("observed", "supermassive BH")) +
    row("Host galaxy", ud.galaxy) + row("Mass", msun);
  document.getElementById("objNote").textContent = bh.note || "";
  document.getElementById("objCredit").textContent =
    "Credit: black-hole mass from the published literature. Marker position is illustrative (galaxy centre).";
}

function showGalaxyInfo(ud) {
  const o = ud.data;
  const central = o.central_bh;
  const upper = centralBlackHoleIsUpperLimit(central)
    ? central.mass_upper_limit_msun ?? central.mass_msun
    : null;
  const centralRows = centralBlackHoleIsUpperLimit(central)
    ? row("Central object", evidenceBadge("observed", "NON-DETECTION")) +
      row("Mass upper limit", upper != null ? `< ${Number(upper).toLocaleString()} M☉` : "Published upper limit")
    : "";
  openInspector(o.catalogue === "—" ? o.name : `${o.name} (${o.catalogue})`, o.type);
  document.getElementById("objTable").innerHTML =
    row("Identity", evidenceBadge("observed", "OBSERVED")) +
    row("Distance estimate", o.distance_mly === 0 ? "our galaxy" : `${o.distance_mly} Mly`) +
    row("Diameter estimate", `${o.diameter_ly.toLocaleString()} ly`) +
    row("Star-count estimate", o.stars) +
    row("Morphology", o.morphology.replace(/_/g, " ")) +
    centralRows +
    row("Star render", evidenceBadge("illustrative", "PROCEDURAL"));
  document.getElementById("objNote").textContent = o.catalogue === "M31"
    ? "Andromeda is approaching the Milky Way, but whether and when the galaxies merge is sensitive to uncertain Local Group motions and model assumptions."
    : o.note;
  document.getElementById("objCredit").textContent = "Credit: " + o.credit +
    " Values are literature estimates without complete field-level citations; the 3-D stellar distribution is an illustrative procedural prior.";
}

function showNebulaInfo(ud) {
  const o = ud.data;
  openInspector(`${o.name} (${o.catalogue})`, o.type);
  document.getElementById("objTable").innerHTML =
    row("Identity", evidenceBadge("observed", "OBSERVED")) +
    row("Distance estimate", `${o.distance_ly.toLocaleString()} ly`) +
    row("Size estimate", `${o.size_ly} ly across`) +
    row("Morphology", o.morphology) +
    row("Stellar render", `${o.render_star_sprites} illustrative sprites`) +
    row("Gas render", evidenceBadge("illustrative", "PROCEDURAL"));
  document.getElementById("objNote").textContent = o.note;
  document.getElementById("objCredit").textContent = "Credit: " + o.credit +
    " Values are approximate literature estimates without complete field-level citations; the 3-D gas distribution is an illustrative procedural prior.";
}

function showWormholeInfo(ud) {
  const o = ud.data, f = o.facts;
  openInspector(o.long_name, "theoretical spacetime bridge");
  document.getElementById("objTable").innerHTML =
    row("Provenance", evidenceBadge("simulated", "THEORETICAL")) +
    row("Status", f.status) + row("Origin", f.origin) +
    row("Traversability", f.traversable) + row("Distinction", f.distinction) +
    row("Throat", f.throat);
  document.getElementById("objNote").textContent = f.note;
  document.getElementById("objCredit").textContent = "Credit: " + o.credit;
}

function showBHInfo(ud) {
  const o = ud.data, f = o.facts;
  openInspector(o.long_name, "EHT-anchored black-hole schematic");
  document.getElementById("objTable").innerHTML =
    row("Parameters", evidenceBadge("observed", "OBSERVED")) +
    row("Location", f.location) + row("Mass", f.mass) + row("Distance", f.distance) +
    row("EHT angular ring", f.ring_diameter) +
    row("Reference shadow scale", o.shadow_diameter_rs != null
      ? taggedValue(`${Number(o.shadow_diameter_rs).toFixed(2)} Rₛ diameter`, "derived", "MODEL-DERIVED")
      : taggedValue("5.20 Rₛ diameter", "derived", "LEGACY FALLBACK")) +
    row("Schwarzschild r", `${o.schwarzschild_km.toLocaleString()} km`) +
    row("Render", evidenceBadge("derived", "SCHEMATIC"));
  document.getElementById("objNote").textContent = f.note;
  document.getElementById("objCredit").textContent = "Credit: " + o.credit +
    ". The visual is an EHT-anchored schematic, not a ray-traced prediction or EHT image reconstruction.";
}

// ---- side zoom scalar ------------------------------------------------------
function camDist(cfg) { return cfg.cam.position.distanceTo(cfg.controls.target); }
function setCamDist(cfg, d) {
  const dir = cfg.cam.position.clone().sub(cfg.controls.target);
  const cur = dir.length() || 1;
  cfg.cam.position.copy(cfg.controls.target).add(dir.multiplyScalar(d / cur));
}
function sliderToDist(cfg, v) { // v 0..100, top(100)=closest
  const [a, b] = cfg.zoom, lo = Math.log(a), hi = Math.log(b);
  return Math.exp(hi + (lo - hi) * (v / 100));
}
function distToSlider(cfg, d) {
  const [a, b] = cfg.zoom, lo = Math.log(a), hi = Math.log(b);
  return Math.max(0, Math.min(100, 100 * (hi - Math.log(THREE.MathUtils.clamp(d, a, b))) / (hi - lo)));
}
function wireZoom() {
  const sl = document.getElementById("zoomSlider");
  sl.addEventListener("input", () => { S.tween = null; setCamDist(L[S.layer], sliderToDist(L[S.layer], parseFloat(sl.value))); });
  const nudge = (f) => { S.tween = null; const cfg = L[S.layer];
    setCamDist(cfg, THREE.MathUtils.clamp(camDist(cfg) * f, cfg.zoom[0], cfg.zoom[1])); };
  document.getElementById("zoomIn").addEventListener("click", () => nudge(0.8));
  document.getElementById("zoomOut").addEventListener("click", () => nudge(1.25));
}
function syncZoom() {
  const cfg = L[S.layer], d = camDist(cfg);
  document.getElementById("zoomSlider").value = distToSlider(cfg, d);
  document.getElementById("scaleReadout").textContent = scaleLabel(cfg, d);
}
function fmt(x) {
  if (x >= 1e6) return (x / 1e6).toFixed(1) + "M";
  if (x >= 1e3) return (x / 1e3).toFixed(1) + "k";
  if (x >= 10) return x.toFixed(0);
  if (x >= 1) return x.toFixed(1);
  return x.toPrecision(2);
}
function scaleLabel(cfg, dist) {
  const halfW = dist * Math.tan(cfg.cam.fov * Math.PI / 360); // scene units across the half-view
  if (cfg.unit === "solar") {
    const au = solar.trueScale ? halfW / 40 : Math.pow(halfW / 7, 1 / 0.6);
    return `~${fmt(2 * au)} AU across`;
  }
  if (cfg.unit === "exo") { const au = halfW * (exo?.unitsPerAU ? 1 / exo.unitsPerAU : 0.1); return `~${fmt(2 * au)} AU across`; }
  if (cfg.unit === "stars") { const pc = halfW; return `~${fmt(2 * pc)} pc (${fmt(2 * pc * 3.262)} ly)`; }
  if (cfg.unit === "cosmic") { const mpc = halfW; return `~${fmt(2 * mpc)} comoving Mpc (${fmt(2 * mpc * 3.262)} comoving Mly)`; }
  if (cfg.unit === "bh") { const rs = halfW / (bh?.unitsPerRs || 1); return `~${fmt(2 * rs)} Schwarzschild radii`; }
  if (cfg.unit === "nebula") { const object = nebula?.objects[nebula.index] ?? DATA.nebula.objects[0]; const lyAcross = halfW * (object.size_ly / 18); return `~${fmt(lyAcross)} ly across`; }
  if (cfg.unit === "galaxies") { const object = galaxyL?.objects[galaxyL.index] ?? DATA.galaxies.objects[1]; const ly = halfW * (object.diameter_ly / 68); return `~${fmt(2 * ly)} ly across`; }
  if (cfg.unit === "cmb") { return "edge of the observable universe"; }
  if (cfg.unit === "wh") { return "theoretical — not to scale"; }
  return "";
}

function doSearch() {
  const q = document.getElementById("searchBox").value.trim();
  const box = document.getElementById("searchResults");
  if (!q) { box.innerHTML = ""; return; }
  fetchJSON(`${API}/api/search?q=${encodeURIComponent(q)}`).then(d =>
    renderHits(d.results.map(r => ({ name: r.name || r.source_id, sid: r.source_id })), box)
  ).catch(() => {
    const ql = q.toLowerCase(); const res = [];
    for (let i = 0; i < DATA.stars.count && res.length < 20; i++)
      if ((DATA.stars.name[i] || "").toLowerCase().includes(ql) || DATA.stars.source_id[i].includes(ql))
        res.push({ name: DATA.stars.name[i] || DATA.stars.source_id[i], sid: DATA.stars.source_id[i] });
    renderHits(res, box);
  });
}
function renderHits(res, box) {
  box.innerHTML = res.length ? res.map(r => `<button type="button" class="hit" data-sid="${escapeHtml(r.sid)}">${escapeHtml(r.name)}</button>`).join("")
    : `<div class="hit">no matches</div>`;
  box.querySelectorAll(".hit[data-sid]").forEach(el => el.addEventListener("click", () => {
    setLayer("stars");
    const i = DATA.stars.source_id.indexOf(el.dataset.sid); if (i >= 0) showStarInfo(i);
  }));
}

// ---- camera fly-to ---------------------------------------------------------
function flyToSurface() {
  if (!S.surface) return;
  const target = S.surface.get(); if (!target) return;
  // even, bright lighting so the whole surface is clearly visible up close
  const bright = document.getElementById("ssBright"); bright.checked = true; solar.setBrightMode(true);
  if (S.surface.name) solar.showLandmarksFor(S.surface.name);   // reveal this body's landmarks
  const radius = S.surface.radius, c = L.solar.cam, controls = L.solar.controls;
  // Frame the whole sunlit disk, sharply: close enough to fill the view but far
  // enough that the texture stays crisp (going closer just magnifies texels).
  // Camera sits on the sunlit side so we see the fully-lit face (no terminator).
  // Low-orbit framing: close enough that the horizon curves across the view,
  // camera on the sunlit side; a slow orbital cruise starts once we arrive.
  const dist = radius * 2.1;   // close, but far enough that textures stay sharp
  const sunDir = target.clone().multiplyScalar(-1).normalize();   // planet -> Sun
  let tangent = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0));
  if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
  tangent.normalize();
  const offset = sunDir.clone().multiplyScalar(0.88).add(tangent.multiplyScalar(0.3))
    .add(new THREE.Vector3(0, 0.12, 0)).normalize().multiplyScalar(dist);
  const duration = transitionDuration(2.2);
  S.tween = { t: 0, dur: duration, fromPos: c.position.clone(), toPos: target.clone().add(offset),
    fromTar: controls.target.clone(), toTar: target.clone(), cam: c, controls, offset, follow: S.surface.follow };
  S.follow = S.surface.follow;
  S.cruise = true;                     // slow drift around the body on arrival
  showCameraRoute(`${S.surface.name} · surface orbit`, duration);
  whoosh(1);
}

function flyToBody(name) {
  solar.showLandmarksFor(null);    // leaving close-up — hide surface landmarks
  S.cruise = false;
  const rec = solar.byName[name];
  if (rec) {
    rec.group.visible = true;
    rec.orbitLine.visible = true;
  }
  const target = rec ? (rec.worldPos || rec.group.position).clone() : (name === "Sun" ? new THREE.Vector3() : null);
  if (!target) return;
  const radius = rec ? rec.sceneR : 3.4;
  const c = L.solar.cam, controls = L.solar.controls;
  // Frame so the Sun lights the visible face but sits off to the side (no backlight).
  const sunDir = target.clone().multiplyScalar(-1).normalize();           // planet -> Sun
  let tangent = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0));
  if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
  tangent.normalize();
  const offset = tangent.multiplyScalar(0.9).add(sunDir.clone().multiplyScalar(0.32))
    .add(new THREE.Vector3(0, 0.32, 0)).normalize().multiplyScalar(Math.max(radius * 3.6, 2.2));
  const duration = transitionDuration(1.7);
  S.tween = { t: 0, dur: duration, fromPos: c.position.clone(), toPos: target.clone().add(offset),
    fromTar: controls.target.clone(), toTar: target.clone(), cam: c, controls, offset, follow: (name !== "Sun") ? name : null };
  S.follow = (name !== "Sun") ? name : null;
  showCameraRoute(name, duration);
  whoosh(1);
}
function flyTo(targetPos, radius, c, controls) {
  const dist = Math.max(radius * 4, 2.5);
  const dir = c.position.clone().sub(controls.target).normalize();
  const duration = transitionDuration(1.6);
  S.tween = { t: 0, dur: duration, fromPos: c.position.clone(), toPos: targetPos.clone().add(dir.multiplyScalar(dist + radius)),
    fromTar: controls.target.clone(), toTar: targetPos.clone(), cam: c, controls };
  showCameraRoute("Selected object", duration);
  whoosh(0.85);
}
// quintic in-out — slow start, confident sweep, feather-soft landing
function ease(t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; }

// ---- loop ------------------------------------------------------------------
function nowJD() { return 2440587.5 + Date.now() / 86400000; }
let _lastDate = "";
let lastUser = performance.now();   // last user interaction (for ambient drift)
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const adt = S.reducedMotion ? 0 : dt;   // freeze decorative motion when reduced
  if (S.playing && !S.reducedMotion) S.jd += speedDaysPerSec() * dt;
  L[S.layer].update(S.jd, adt);
  if (S.layer === "solar") updateDate();
  if (!S.tween) syncZoom();

  if (S.tween) {
    // If following a moving body, re-aim at its live position each frame.
    if (S.tween.follow && solar.byName[S.tween.follow]) {
      const live = solar.byName[S.tween.follow].worldPos;
      if (live) { S.tween.toTar.copy(live); S.tween.toPos.copy(live).add(S.tween.offset); }
    }
    S.tween.t += dt / S.tween.dur; const k = ease(Math.min(1, S.tween.t));
    S.tween.cam.position.lerpVectors(S.tween.fromPos, S.tween.toPos, k);
    S.tween.controls.target.lerpVectors(S.tween.fromTar, S.tween.toTar, k);
    if (S.tween.t >= 1) S.tween = null;
  } else if (S.follow && S.layer === "solar" && solar.byName[S.follow]) {
    // Lock the view on the selected body as it orbits (keeps relative camera).
    const live = solar.byName[S.follow].worldPos;
    if (live) {
      const delta = live.clone().sub(L.solar.controls.target);
      L.solar.controls.target.add(delta);
      L.solar.cam.position.add(delta);
    }
  }
  if (!S.reducedMotion) { const tt = performance.now() * 0.001; for (const m of starMats) m.uniforms.uTime.value = tt; }
  // ambient drift: after 12 s idle the active camera orbits very slowly — the
  // scene never feels frozen. Any interaction stops it instantly.
  const cruise = S.cruise && S.layer === "solar";
  const drift = QUALITY.autoMotion && !S.reducedMotion && !S.tween &&
    (cruise || performance.now() - lastUser > 12000);
  const activeControls = L[S.layer].controls;
  activeControls.autoRotate = drift;
  activeControls.autoRotateSpeed = cruise ? 0.55 : 0.22;
  activeControls.update();
  renderActiveFrame();
  labelRenderer.render(L[S.layer].scene, L[S.layer].cam);
  if (pendingLayerPaint?.key === S.layer) {
    const pending = pendingLayerPaint;
    pendingLayerPaint = null;
    requestAnimationFrame(() => {
      const paintedMark = `uep:layer:${pending.key}-painted`;
      const measureName = `uep:layer:${pending.key}-activation-to-painted`;
      if (performance.getEntriesByName(measureName).length > 0) return;
      performance.mark(paintedMark);
      performance.measure(measureName, pending.activationMark, paintedMark);
    });
  }
}
function updateDate() {
  const d = new Date((S.jd - 2440587.5) * 86400000), s = d.toUTCString().slice(5, 16);
  if (s !== _lastDate) { _lastDate = s; document.getElementById("dateLabel").textContent = s + " UTC"; }
}
function onResize() {
  QUALITY = applyRendererConstraints(getQualityProfile({ viewportWidth: innerWidth, viewportHeight: innerHeight, devicePixelRatio, reducedMotion: S.reducedMotion }));
  document.getElementById("renderInfo").textContent =
    `${navigator.gpu ? "WebGPU ready" : "WebGL"} · ${QUALITY.tier}`;
  for (const k in L) { L[k].cam.aspect = innerWidth / innerHeight; L[k].cam.updateProjectionMatrix(); }
  renderer.setPixelRatio(QUALITY.pixelRatio);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  bloom.enabled = QUALITY.bloom;
  bloom.strength = QUALITY.bloom ? L[S.layer].bloom[1] : 0;
  labelRenderer.setSize(innerWidth, innerHeight);
  closeMobileDrawers();
}
