// Universe Experience Platform — premium client orchestrator (4 layers).
// Solar System · Exoplanets · Stellar Neighbourhood · Cosmic Web, over one
// backend, with bloom, 3D labels, cinematic fly-to, and time controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { setMaxAnisotropy } from "./realtex.js";
import { SolarSystem } from "./solarsystem.js";
import { ExoExplorer } from "./exoplanets.js";
import { StarField } from "./stars.js";
import { CosmicWeb } from "./cosmicweb.js";
import { BlackHoleScene } from "./blackhole.js";
import { NebulaScene } from "./nebula.js";
import { GalaxyScene } from "./galaxymodel.js";
import { CMBScene } from "./cmb.js";
import { WormholeScene } from "./wormhole.js";
import { drawHR, drawTransit, drawRedshift } from "./datainspect.js";
import { startAmbient, setAudioMuted, whoosh } from "./sound.js";
import { tempFromBpRp, spectralClass, STAR_FACTS } from "./starinfo.js";
import { lookupKnowledge } from "./knowledge.js";

const API = "";
const fetchJSON = (u) => fetch(u).then(r => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
const row = (k, v) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`;

const S = { layer: "solar", jd: 0, playing: true, speed: 2, exoSpin: true, follow: null, tourActive: false,
  reducedMotion: false, dataOpen: false, selStar: null, selExoPlanet: null,
  tween: null, raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2() };
const LAYER_ORDER = ["solar", "exo", "stars", "nebula", "galaxies", "cosmic", "cmb", "bh", "wh"];

let renderer, labelRenderer, composer, renderPass, bloom;
let solar, exo, stars, cosmic, bh, nebula, galaxyL, cmbL, wh, manifest;
let UNI_INDEX = [];
let L; // layer registry
const clock = new THREE.Clock();

const DESCRIPTIONS = {
  solar: "Our Solar System from JPL orbital elements — planets, dwarf planets, moons, rings and the asteroid belt, animated in real time.",
  exo: "Real confirmed planetary systems from the NASA Exoplanet Archive, with the habitable zone shaded green.",
  stars: "6,000 real stars from ESA Gaia DR3 in the solar neighbourhood, coloured by measurement confidence.",
  cosmic: "The local cosmic web — thousands of galaxies from the 2MASS Redshift Survey at their comoving distances.",
  bh: "Horizon-scale black holes imaged by the Event Horizon Telescope — a validated approximation of the disk, photon ring and Doppler beaming.",
  cmb: "The cosmic microwave background — the universe's first light, from 380,000 years after the Big Bang, at the very edge of the observable universe.",
  nebula: "Famous nebulae rendered as illustrative volumetric gas clouds — measured distance and size, procedurally rendered structure.",
  galaxies: "Famous galaxies as procedural models matched to their measured morphology — spiral, barred, elliptical and edge-on.",
  wh: "A traversable wormhole — an Einstein–Rosen bridge. Purely theoretical: a visualisation of the geometry, never an observation.",
};

init();

async function init() {
  const canvas = document.getElementById("scene");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  labelRenderer = new CSS2DRenderer({ element: document.getElementById("labels") });
  labelRenderer.setSize(innerWidth, innerHeight);

  document.getElementById("renderInfo").innerHTML = navigator.gpu
    ? "⚡ WebGPU detected — production target. Prototype renders on WebGL + bloom."
    : "WebGL renderer + bloom.";

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
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const smaa = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  composer.addPass(smaa);

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

  S.jd = solarData.epoch_jd;
  solar = new SolarSystem(solarData); solarScene.add(solar.group); solarScene.add(backdrop(2500, 1400));
  exo = new ExoExplorer(exoData); exoScene.add(exo.group); exoScene.add(backdrop(2000, 900));
  stars = new StarField(starScene); stars.build(starData); starScene.add(stars.group); starScene.add(backdrop(1500, 6000));
  cosmic = new CosmicWeb(cosmicData); cosmicScene.add(cosmic.group);
  bh = new BlackHoleScene(bhData); bhScene.add(bh.group); bhScene.add(backdrop(2500, 1200));
  nebula = new NebulaScene(nebData); nebulaScene.add(nebula.group); nebulaScene.add(backdrop(2200, 1500));
  galaxyL = new GalaxyScene(galData); galaxyScene.add(galaxyL.group); galaxyScene.add(backdrop(2400, 1600));
  cmbL = new CMBScene(cmbData); cmbScene.add(cmbL.group);
  wh = new WormholeScene(); whScene.add(wh.group); whScene.add(backdrop(2600, 1300));

  // near-camera parallax dust — makes every camera move feel dimensional
  addDust(solarScene, 90); addDust(exoScene, 40);
  addDust(starScene, 420, 400, 40); addDust(nebulaScene, 60); addDust(galaxyScene, 90);

  L = {
    solar: { scene: solarScene, cam: solarCam, controls: mk(solarCam), panel: "solarControls",
      legend: false, labels: true, bloom: [0.3, 0.5], zoom: [4, 420], unit: "solar",
      update: (jd, dt) => solar.update(jd, dt, solarCam), pickables: () => solar.pickables, pick: (h) => showSolarInfo(h.object.userData, h.object) },
    exo: { scene: exoScene, cam: exoCam, controls: mk(exoCam), panel: "exoControls",
      legend: false, labels: true, bloom: [0.1, 0.8], zoom: [4, 220], unit: "exo",
      update: (jd, dt) => { if (S.exoSpin) exo.update(jd); exo.tick(dt); }, pickables: () => exo.pickables, pick: (h) => showExoInfo(h.object.userData) },
    stars: { scene: starScene, cam: starCam, controls: mk(starCam), panel: "starControls",
      legend: true, labels: false, bloom: [0.0, 0.9], zoom: [12, 1600], unit: "stars",
      update: () => stars.faceRing(starCam), pickables: () => stars.pickables, pick: (h) => showStarInfo(h.index) },
    cosmic: { scene: cosmicScene, cam: cosmicCam, controls: mk(cosmicCam), panel: "cosmicControls",
      legend: false, labels: true, bloom: [0.0, 0.85], zoom: [25, 2200], unit: "cosmic",
      update: (jd, dt) => cosmic.update(dt), pickables: () => cosmic.pickables, pick: (h) => showCosmicInfo(h.index) },
    bh: { scene: bhScene, cam: bhCam, controls: mk(bhCam), panel: "bhControls",
      legend: false, labels: true, bloom: [0.6, 0.32], zoom: [10, 160], unit: "bh",
      update: (jd, dt) => bh.update(dt, bhCam), pickables: () => bh.pickables, pick: (h) => showBHInfo(h.object.userData) },
    nebula: { scene: nebulaScene, cam: nebulaCam, controls: mk(nebulaCam), panel: "nebulaControls",
      legend: false, labels: true, bloom: [0.0, 0.85], zoom: [22, 320], unit: "nebula",
      update: (jd, dt) => nebula.update(dt), pickables: () => nebula.pickables, pick: (h) => showNebulaInfo(h.object.userData) },
    galaxies: { scene: galaxyScene, cam: galaxyCam, controls: mk(galaxyCam), panel: "galaxyControls",
      legend: false, labels: true, bloom: [0.0, 0.8], zoom: [28, 700], unit: "galaxies",
      update: (jd, dt) => galaxyL.update(dt, galaxyCam), pickables: () => galaxyL.pickables, pick: galaxyPick },
    cmb: { scene: cmbScene, cam: cmbCam, controls: mk(cmbCam), panel: "cmbControls",
      legend: false, labels: true, bloom: [0.85, 0.08], zoom: [4, 60], unit: "cmb",
      update: (jd, dt) => cmbL.update(dt), pickables: () => cmbL.pickables, pick: () => showCMBInfo() },
    wh: { scene: whScene, cam: whCam, controls: mk(whCam), panel: "whControls",
      legend: false, labels: true, bloom: [0.35, 0.65], zoom: [9, 160], unit: "wh",
      update: (jd, dt) => wh.update(dt, whCam), pickables: () => wh.pickables, pick: (h) => showWormholeInfo(h.object.userData) },
  };
  L.cmb.controls.minDistance = 2; L.cmb.controls.maxDistance = 120;

  buildJumpButtons(solarData);
  buildExoSelector();
  buildBHSelector();
  buildNebulaSelector();
  buildGalaxySelector();
  document.getElementById("cmbSummary").innerHTML =
    `<b>Surface of last scattering</b> — 2.725 K · z ≈ 1089<br>The universe's first light, ~380,000 years after the Big Bang.`;
  UNI_INDEX = buildUniverseIndex();
  wireUI();
  wireZoom();
  setLayer("solar");
  addEventListener("resize", onResize);
  canvas.addEventListener("pointerdown", onPick);

  const ld = document.getElementById("loading");
  ld.classList.add("gone"); setTimeout(() => ld.remove(), 900);
  document.getElementById("enterBtn").addEventListener("click", () => enterUniverse(false));
  document.getElementById("introTour").addEventListener("click", () => enterUniverse(true));
  animate();
}

// Dismiss the cinematic intro: slow establishing dolly into the system, or
// jump straight into the guided tour.
function enterUniverse(tour) {
  const intro = document.getElementById("intro");
  if (intro) { intro.classList.add("gone"); setTimeout(() => intro.remove(), 1200); }
  lastUser = performance.now();
  startAmbient();   // user gesture — autoplay-safe
  if (tour) { playTour(); return; }
  const c = L.solar.cam, controls = L.solar.controls;
  S.tween = { t: 0, dur: 3.4, fromPos: c.position.clone(), toPos: new THREE.Vector3(0, 34, 78),
    fromTar: controls.target.clone(), toTar: new THREE.Vector3(0, 0, 0), cam: c, controls };
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
function setLayer(key) {
  if (_layerInit && key !== S.layer) crossfade();
  _layerInit = true;
  S.layer = key;
  const cfg = L[key];
  renderPass.scene = cfg.scene; renderPass.camera = cfg.cam;
  for (const k in L) L[k].controls.enabled = (k === key);
  bloom.threshold = cfg.bloom[0]; bloom.strength = cfg.bloom[1];

  document.querySelectorAll(".layer-btn").forEach(b => b.classList.toggle("active", b.dataset.layer === key));
  ["solarControls", "exoControls", "starControls", "cosmicControls", "bhControls", "nebulaControls", "galaxyControls", "cmbControls", "whControls"].forEach(id =>
    document.getElementById(id).classList.toggle("hidden", id !== cfg.panel));
  document.getElementById("legend").classList.toggle("hidden", !cfg.legend);
  document.getElementById("inspector").classList.add("hidden");
  document.getElementById("labels").style.display = cfg.labels ? "block" : "none";
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
  populateMeta();
  syncZoom();
  renderDataPanel();
}

function setSceneLabels(scene, show) {
  // Only reveal labels whose whole ancestor chain is visible — otherwise
  // landmark labels inside hidden groups leak through (CSS2DRenderer skips
  // invisible subtrees and never resets their DOM display).
  scene.traverse((o) => {
    if (!o.element) return;
    let vis = show, n = o;
    while (vis && n) { vis = n.visible; n = n.parent; }
    o.element.style.display = vis ? "" : "none";
  });
}

function populateMeta() {
  const rowsByLayer = {
    solar: [["Bodies", "8 planets · 5 dwarfs · 13 moons"], ["Frame", "Heliocentric ecliptic"],
      ["Positions", "Keplerian (JPL)"], ["Provenance", "DERIVED · inferred"], ["Credit", "NASA/JPL SSD"]],
    bh: [["Objects", "Sgr A* · M87*"], ["Frame", "Local · Schwarzschild radii"],
      ["Imaging", "Event Horizon Telescope"], ["Provenance", "OBSERVED · render DERIVED"], ["Credit", "EHT Collaboration"]],
    nebula: [["Objects", `${nebula.objects.length} nebulae`], ["Frame", "Local · light-years"],
      ["Identity", "measured"], ["Gas render", "PROCEDURAL"], ["Credit", "Literature + illustrative"]],
    galaxies: [["Objects", `${galaxyL.objects.length} galaxies`], ["Frame", "Local · light-years"],
      ["Distance/type", "measured"], ["Star render", "PROCEDURAL"], ["Credit", "Literature + illustrative"]],
    exo: [["Systems", exo.systems.length], ["Planets", exo.systems.reduce((a, s) => a + s.n_planets, 0)],
      ["Frame", "Per-system orbital plane"], ["Provenance", "OBSERVED · measured"], ["Credit", "NASA Exoplanet Archive"]],
    stars: [["Sources", manifest.total_sources.toLocaleString()], ["Frame", "Galactic XYZ (pc)"],
      ["Cosmology", manifest.cosmology], ["Release", manifest.dataset_release],
      ["Data mode", manifest.source_mode === "gaia" ? "OBSERVED (live)" : "PROCEDURAL"], ["Credit", manifest.credit]],
    cosmic: [["Galaxies", cosmic.data.count.toLocaleString()], ["Frame", "Comoving Mpc"],
      ["Cosmology", cosmic.data.cosmology], ["Distance", "redshift → Planck18"],
      ["Provenance", cosmic.data.source_mode === "2mrs" ? "OBSERVED · measured" : "PROCEDURAL"],
      ["Credit", cosmic.data.source_mode === "2mrs" ? "2MRS / CDS" : "UEP procedural"]],
    cmb: [["Temperature", "2.725 K"], ["Redshift", "z ≈ 1089"], ["Age at emission", "≈ 380,000 yr"],
      ["Distance", "≈ 45.5 Gly"], ["Provenance", "OBSERVED · pattern PROCEDURAL"], ["Credit", "Planck / WMAP / COBE"]],
    wh: [["Object", "Einstein–Rosen bridge"], ["Status", "THEORETICAL — never observed"],
      ["Frame", "Local · throat radii"], ["Provenance", "MODELLED · simulated"],
      ["Credit", "Einstein–Rosen 1935 · Morris–Thorne 1988"]],
  };
  document.getElementById("meta").innerHTML = rowsByLayer[S.layer].map(([k, v]) => row(k, v)).join("");
}

// ---- UI --------------------------------------------------------------------
function buildJumpButtons(data) {
  const wrap = document.getElementById("planetJump");
  const names = ["Sun", ...data.planets.filter(p => p.category !== "dwarf").map(p => p.name)];
  wrap.innerHTML = names.map(n => `<button data-body="${n}">${n}</button>`).join("");
  wrap.querySelectorAll("button").forEach(b => b.addEventListener("click", () => flyToBody(b.dataset.body)));
}
function buildBHSelector() {
  const sel = document.getElementById("bhSelect");
  sel.innerHTML = bh.names().map((n, i) => `<option value="${i}">${n}</option>`).join("");
  sel.addEventListener("change", () => selectBH(parseInt(sel.value)));
  selectBH(0);
}
function selectBH(i) {
  bh.build(i);
  const o = bh.objects[i];
  document.getElementById("bhSummary").innerHTML =
    `<b>${o.long_name}</b> — ${o.facts.mass} · ${o.facts.distance}<br>` +
    `Schwarzschild radius ≈ ${o.schwarzschild_km.toLocaleString()} km`;
}
function buildNebulaSelector() {
  const sel = document.getElementById("nebulaSelect");
  sel.innerHTML = nebula.names().map((n, i) => `<option value="${i}">${n}</option>`).join("");
  sel.addEventListener("change", () => selectNebula(parseInt(sel.value)));
  selectNebula(0);
}
function selectNebula(i) {
  nebula.build(i);
  const o = nebula.objects[i];
  document.getElementById("nebulaSummary").innerHTML =
    `<b>${o.name}</b> (${o.catalogue}) — ${o.type}<br>` +
    `${o.distance_ly.toLocaleString()} ly away · ${o.size_ly} ly across`;
}
function buildGalaxySelector() {
  const sel = document.getElementById("galaxySelect");
  sel.innerHTML = galaxyL.names().map((n, i) => `<option value="${i}">${n}</option>`).join("");
  sel.addEventListener("change", () => selectGalaxy(parseInt(sel.value)));
  selectGalaxy(1);   // start on Andromeda
  sel.value = "1";
}
function selectGalaxy(i) {
  galaxyL.build(i);
  const o = galaxyL.objects[i];
  const dist = o.distance_mly === 0 ? "our galaxy" : `${o.distance_mly} Mly away`;
  document.getElementById("galaxySummary").innerHTML =
    `<b>${o.name}</b>${o.catalogue !== "—" ? " (" + o.catalogue + ")" : ""} — ${o.type}<br>` +
    `${dist} · ${(o.diameter_ly / 1000).toLocaleString()} kly across`;
}
function buildExoSelector() {
  const sel = document.getElementById("exoSystem");
  sel.innerHTML = exo.systemNames().map((n, i) => `<option value="${i}">${n}</option>`).join("");
  sel.addEventListener("change", () => selectExoSystem(parseInt(sel.value)));
  selectExoSystem(0);
}
function selectExoSystem(i) {
  exo.buildSystem(i);
  const s = exo.systems[i];
  const hz = s.hz_inner_au ? `HZ ${s.hz_inner_au}–${s.hz_outer_au} AU` : "HZ not constrained";
  document.getElementById("exoSummary").innerHTML =
    `<b>${s.hostname}</b> — ${s.n_planets} planets · ${s.distance_pc ? s.distance_pc + " pc" : "distance n/a"}` +
    `${s.st_teff ? " · Teff " + s.st_teff + " K" : ""}<br>${hz}`;
}

function wireUI() {
  document.querySelectorAll(".layer-btn").forEach(b => b.addEventListener("click", () => setLayer(b.dataset.layer)));
  document.getElementById("playPause").addEventListener("click", (e) => {
    S.playing = !S.playing; e.target.textContent = S.playing ? "⏸ Pause" : "▶ Play";
  });
  document.getElementById("nowBtn").addEventListener("click", () => { S.jd = nowJD(); });
  const speed = document.getElementById("speed");
  speed.addEventListener("input", () => { S.speed = parseFloat(speed.value); updateSpeedLabel(); });
  updateSpeedLabel();
  document.getElementById("ssLabels").addEventListener("change", (e) =>
    document.getElementById("labels").style.opacity = e.target.checked ? "1" : "0");
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
    S.tween = null;
    if (e.target.checked) {
      galaxyL.buildField();
      document.getElementById("galaxyPickRow").classList.add("hidden");
      document.getElementById("galaxySummary").innerHTML = "All 7 galaxies shown together in 3-D. Click a galaxy or its golden central black hole.";
      L.galaxies.cam.position.set(0, 70, 165); L.galaxies.controls.target.set(0, 0, 0);
    } else {
      document.getElementById("galaxyPickRow").classList.remove("hidden");
      selectGalaxy(parseInt(document.getElementById("galaxySelect").value || "1"));
      L.galaxies.cam.position.set(0, 30, 78); L.galaxies.controls.target.set(0, 0, 0);
    }
  });
  document.getElementById("toggleConfidence").addEventListener("change", (e) => stars.setConfidenceColor(e.target.checked));
  document.getElementById("toggleUncertainty").addEventListener("change", () => stars.clearUncertainty());
  document.getElementById("pointSize").addEventListener("input", (e) => stars.setPointScale(parseFloat(e.target.value)));
  document.getElementById("galSize").addEventListener("input", (e) =>
    cosmic.points.material.uniforms.uScale.value = parseFloat(e.target.value));
  document.getElementById("searchBtn").addEventListener("click", doSearch);
  document.getElementById("searchBox").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
  document.getElementById("closeInspector").addEventListener("click", () => {
    document.getElementById("inspector").classList.add("hidden"); stars.clearUncertainty();
  });
  document.getElementById("surfaceBtn").addEventListener("click", flyToSurface);
  const us = document.getElementById("uniSearch");
  us.addEventListener("input", () => renderUniResults(searchUniverse(us.value)));
  us.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const hits = searchUniverse(us.value);
      if (hits.length) { hits[0].run(); clearUni(); }
      else resolveExternal(us.value.trim());
    } else if (e.key === "Escape") { clearUni(); us.blur(); }
  });
  document.getElementById("tourBtn").addEventListener("click", () => S.tourActive ? stopTour() : playTour());
  document.getElementById("creditsBtn").addEventListener("click", showCredits);
  document.getElementById("closeCredits").addEventListener("click", () =>
    document.getElementById("credits").classList.add("hidden"));
  document.getElementById("helpBtn").addEventListener("click", () =>
    document.getElementById("help").classList.toggle("hidden"));
  document.getElementById("closeHelp").addEventListener("click", () =>
    document.getElementById("help").classList.add("hidden"));
  document.getElementById("reducedMotion").addEventListener("change", (e) => setReducedMotion(e.target.checked));
  document.getElementById("dataBtn").addEventListener("click", toggleData);
  document.getElementById("closeData").addEventListener("click", toggleData);
  // light / dark interface theme (3-D space stays dark; panels switch)
  const themeBtn = document.getElementById("themeBtn");
  const applyTheme = (t) => {
    document.body.classList.toggle("light", t === "light");
    themeBtn.textContent = t === "light" ? "🌙" : "☀";
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
    soundBtn.textContent = on ? "🔊" : "🔇";
    try { localStorage.setItem("uep-sound", on ? "on" : "off"); } catch (_) {}
  };
  soundBtn.addEventListener("click", () => applySound(soundBtn.textContent === "🔇"));
  let sPref = "on"; try { sPref = localStorage.getItem("uep-sound") || "on"; } catch (_) {}
  if (sPref === "off") { setAudioMuted(true); soundBtn.textContent = "🔇"; }
  addEventListener("keydown", onKey);
  // idle detection for the ambient camera drift
  ["pointerdown", "wheel", "keydown", "touchstart"].forEach(ev =>
    addEventListener(ev, () => { lastUser = performance.now(); }, { passive: true }));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.getElementById("reducedMotion").checked = true; setReducedMotion(true);
  }
}

// ---- keyboard & accessibility ----------------------------------------------
function onKey(e) {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  const k = e.key;
  const num = { "1": "solar", "2": "exo", "3": "stars", "4": "nebula", "5": "galaxies", "6": "cosmic", "7": "cmb", "8": "bh", "9": "wh" };
  if (num[k]) { setLayer(num[k]); return; }
  switch (k.toLowerCase()) {
    case "arrowright": cycleLayer(1); break;
    case "arrowleft": cycleLayer(-1); break;
    case "t": document.getElementById("tourBtn").click(); break;
    case "c": document.getElementById("creditsBtn").click(); break;
    case "d": toggleData(); break;
    case "?": document.getElementById("help").classList.toggle("hidden"); break;
    case " ": e.preventDefault(); S.playing = !S.playing;
      { const b = document.getElementById("playPause"); if (b) b.textContent = S.playing ? "⏸ Pause" : "▶ Play"; } break;
    case "r": { const c = document.getElementById("reducedMotion"); c.checked = !c.checked; setReducedMotion(c.checked); } break;
    case "p": togglePhoto(); break;
    case "s": if (document.body.classList.contains("photo")) savePhoto(); break;
    case "escape":
      if (S.tourActive) stopTour();
      togglePhoto(false);
      ["inspector", "credits", "help"].forEach(id => document.getElementById(id).classList.add("hidden"));
      break;
  }
}
function cycleLayer(d) {
  const i = (LAYER_ORDER.indexOf(S.layer) + d + LAYER_ORDER.length) % LAYER_ORDER.length;
  setLayer(LAYER_ORDER[i]);
}
function setReducedMotion(on) {
  S.reducedMotion = on;
  if (on) { S.playing = false; const b = document.getElementById("playPause"); if (b) b.textContent = "▶ Play"; }
}

// ---- universal search ------------------------------------------------------
function buildUniverseIndex() {
  const idx = [];
  const add = (keys, label, layer, run) =>
    idx.push({ keys: keys.filter(Boolean).map(k => String(k).toLowerCase()), label, layer, run });

  add(["sun", "sol"], "Sun", "solar", () => { setLayer("solar"); selectAndShowSolar("Sun"); });
  solar.planets.forEach(p =>
    add([p.name], `${p.name}`, p.data.category === "dwarf" ? "dwarf planet" : "planet",
      () => { setLayer("solar"); selectAndShowSolar(p.name); }));
  exo.systems.forEach((s, i) =>
    add([s.hostname], `${s.hostname} — ${s.n_planets} planets`, "exoplanets",
      () => { setLayer("exo"); document.getElementById("exoSystem").value = i; selectExoSystem(i); }));
  nebula.objects.forEach((o, i) =>
    add([o.name, o.catalogue], `${o.name} (${o.catalogue})`, "nebula",
      () => { setLayer("nebula"); document.getElementById("nebulaSelect").value = i; selectNebula(i); }));
  galaxyL.objects.forEach((o, i) =>
    add([o.name, o.catalogue], `${o.name}${o.catalogue !== "—" ? " (" + o.catalogue + ")" : ""}`, "galaxy",
      () => { setLayer("galaxies"); const c = document.getElementById("galaxyField");
        if (c.checked) { c.checked = false; c.dispatchEvent(new Event("change")); }
        document.getElementById("galaxySelect").value = i; selectGalaxy(i); }));
  bh.objects.forEach((o, i) =>
    add([o.name, o.long_name], `${o.long_name}`, "black hole",
      () => { setLayer("bh"); document.getElementById("bhSelect").value = i; selectBH(i); }));
  add(["cmb", "cosmic microwave background", "big bang", "last scattering"],
    "Cosmic Microwave Background", "cosmology", () => setLayer("cmb"));
  add(["wormhole", "einstein-rosen", "einstein rosen bridge", "morris-thorne"],
    "Wormhole (theoretical)", "spacetime", () => setLayer("wh"));
  for (let i = 0; i < stars.data.count; i++) {
    const n = stars.data.name[i];
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
    `<div class="hit${i === 0 ? " sel" : ""}" data-i="${UNI_INDEX.indexOf(h)}"><span>${h.label}</span><span class="lyr">${h.layer}</span></div>`).join("");
  box.querySelectorAll(".hit").forEach(el => el.addEventListener("click", () => {
    const e = UNI_INDEX[+el.dataset.i]; if (e) { e.run(); clearUni(); }
  }));
}
function clearUni() {
  document.getElementById("uniResults").innerHTML = "";
  document.getElementById("uniSearch").value = "";
}
async function resolveExternal(q) {
  if (!q) return;
  const box = document.getElementById("uniResults");
  box.innerHTML = `<div class="hit"><span>Resolving “${q}” via SIMBAD/NED…</span></div>`;
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
    box.innerHTML = `<div class="hit"><span>No match for “${q}”. Try a planet, star, galaxy, M-number or NGC id.</span></div>`;
  }
}

// ---- guided tour -----------------------------------------------------------
function exoIndex(host) { const i = exo.systems.findIndex(s => s.hostname === host); return i < 0 ? 0 : i; }
const TOUR = [
  { layer: "solar", cap: "Welcome. This is home — our Solar System, built from NASA/JPL orbital data and real planet imagery.", dur: 6500 },
  { layer: "solar", cap: "Earth: the only world we know to harbour life. Watch the city lights on its night side.", enter: () => flyToBody("Earth"), dur: 8000 },
  { layer: "solar", cap: "Saturn, wrapped in its rings of ice and rock — and a family of moons.", enter: () => flyToBody("Saturn"), dur: 8000 },
  { layer: "stars", cap: "Beyond the Sun lie thousands of real stars, their distances measured by ESA's Gaia mission.", dur: 7500 },
  { layer: "exo", cap: "Many stars host their own worlds. TRAPPIST-1 has seven planets — three in the habitable zone.", enter: () => selectExoSystem(exoIndex("TRAPPIST-1")), dur: 8000 },
  { layer: "nebula", cap: "Stars are born inside vast clouds of gas — nebulae like Orion, a stellar nursery 1,344 light-years away.", enter: () => selectNebula(0), dur: 8000 },
  { layer: "galaxies", cap: "Our Sun is one of billions of stars in the Milky Way — itself just one galaxy among countless others.", enter: () => { const c = document.getElementById("galaxyField"); if (!c.checked) { c.checked = true; c.dispatchEvent(new Event("change")); } }, dur: 9000 },
  { layer: "bh", cap: "At the heart of nearly every galaxy lurks a supermassive black hole, like Sagittarius A* at our own centre.", enter: () => selectBH(0), dur: 8500 },
  { layer: "cosmic", cap: "Zoom out far enough and the galaxies themselves trace the cosmic web — the largest structure in the universe.", dur: 9000 },
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
    drawHR(canvas, stars.data, S.selStar);
    cap.textContent = `${stars.data.count.toLocaleString()} Gaia stars · colour vs absolute magnitude (OBSERVED). Click a star in the scene to highlight it here.`;
  } else if (S.layer === "exo") {
    title.textContent = "Transit light curve";
    const r = drawTransit(canvas, S.selExoPlanet, exo.systems[exo.index]);
    cap.textContent = r ? `Modelled transit: depth ≈ ${r.depthPpm.toLocaleString()} ppm · duration ≈ ${r.durHours.toFixed(1)} h — DERIVED from the measured planet/star radii and orbital period.`
      : "Click a planet in the scene to model its transit dip.";
  } else if (S.layer === "cosmic") {
    title.textContent = "Redshift distribution";
    drawRedshift(canvas, cosmic.data);
    cap.textContent = `${cosmic.data.count.toLocaleString()} galaxies (2MASS Redshift Survey) · measured redshifts.`;
  } else {
    title.textContent = "Data inspection";
    const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, canvas.width, canvas.height);
    cap.textContent = "Charts available in the Stellar (HR diagram), Exoplanet (transit) and Cosmic Web (redshift) layers.";
  }
}

// ---- credits / acknowledgement ledger --------------------------------------
const CREDITS = [
  ["Stars (Gaia DR3)", "ESA/Gaia/DPAC. This work has made use of data from the ESA mission Gaia, processed by the Gaia Data Processing and Analysis Consortium. CC BY-SA 3.0 IGO."],
  ["Solar System ephemerides & bodies", "NASA/JPL Solar System Dynamics — approximate Keplerian elements and body parameters."],
  ["Planet / Moon / Sun textures", "NASA-derived maps via threejs.org (Earth, Moon) and the threex.planets project (other planets, Sun, Saturn ring)."],
  ["Exoplanets", "NASA Exoplanet Archive (NExScI/Caltech), operated under contract with NASA."],
  ["Galaxy redshifts (cosmic web)", "2MASS Redshift Survey (Huchra et al. 2012), via VizieR/CDS, Strasbourg."],
  ["Resolved galaxies & central black-hole masses", "Parameters from the published literature; 3-D star distributions are illustrative procedural priors."],
  ["Black holes (Sgr A*, M87*)", "Event Horizon Telescope Collaboration (2019, 2022). Render is a validated real-time approximation."],
  ["Nebulae", "Distances/sizes from the literature; volumetric gas rendering is an illustrative procedural prior."],
  ["Cosmology", "Distances use the Planck 2018 (Planck18) cosmology via Astropy."],
];
function showCredits() {
  document.getElementById("creditsBody").innerHTML = CREDITS.map(([t, d]) =>
    `<div class="src"><b>${t}</b><div>${d}</div></div>`).join("");
  document.getElementById("credits").classList.remove("hidden");
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

// ---- photo mode (hide the interface for a clean frame) ---------------------
function togglePhoto(on) {
  const en = (on !== undefined) ? on : !document.body.classList.contains("photo");
  document.body.classList.toggle("photo", en);
}
function savePhoto() {
  composer.render();   // fresh frame in the same tick so toBlob captures it
  renderer.domElement.toBlob((b) => {
    if (!b) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "universe-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
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
  let rows = row("Provenance", `<span class="badge derived">DERIVED</span>`);
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
  if (ud.kind === "star") {
    openInspector(d.hostname, "host star");
    document.getElementById("objTable").innerHTML =
      row("Provenance", `<span class="badge observed">OBSERVED</span>`) +
      row("Distance", d.distance_pc ? `${d.distance_pc} pc` : "—") +
      row("Temperature", d.st_teff ? `${d.st_teff} K` : "—") +
      row("Radius", d.st_rad_sun ? `${d.st_rad_sun} R☉` : "—") +
      row("Planets", d.n_planets) +
      row("Habitable zone", d.hz_inner_au ? `${d.hz_inner_au}–${d.hz_outer_au} AU` : "—");
    document.getElementById("objNote").textContent = "";
  } else {
    openInspector(d.name, `planet · orbits ${d.host}`);
    document.getElementById("objTable").innerHTML =
      row("Provenance", `<span class="badge observed">OBSERVED</span>`) +
      row("Radius", d.radius_earth ? `${d.radius_earth} R⊕` : "—") +
      row("Orbital period", d.period_days ? `${d.period_days} days` : "—") +
      row("Distance from star", d.sma_au ? `${d.sma_au} AU` : "—") +
      row("Equilibrium temp", d.eq_temp_k ? `${d.eq_temp_k} K` : "—") +
      row("In habitable zone", d.in_hz ? "✔ yes" : "no");
    document.getElementById("objNote").textContent = d.in_hz
      ? "Orbits within the conservative habitable zone — liquid water could be stable given an atmosphere." : "";
    S.selExoPlanet = d; if (S.dataOpen) renderDataPanel();
  }
  document.getElementById("objCredit").textContent =
    "Credit: NASA Exoplanet Archive (NExScI/Caltech). Habitable zone derived from stellar luminosity.";
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
  openInspector(rec.name || rec.source_id, "star · Gaia DR3");
  document.getElementById("objTable").innerHTML =
    row("Provenance", `<span class="badge ${p.confidence}">${p.source_type}</span>`) +
    row("Distance", `${rec.distance_pc.toFixed(2)} pc (${ly.toFixed(1)} ly)${unc != null ? " ± " + unc.toFixed(2) : ""}`) +
    (spec ? row("Spectral type", `${spec} <span style="color:var(--muted)">(est.)</span>`) : "") +
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
  openInspector("Galaxy", "2MASS Redshift Survey");
  const ly = info.dist_mpc * 3.262; // Mpc -> million light-years
  document.getElementById("objTable").innerHTML =
    row("Provenance", `<span class="badge observed">OBSERVED</span>`) +
    row("Redshift z", info.z.toFixed(5)) +
    row("Comoving dist", `${info.dist_mpc.toFixed(1)} Mpc`) +
    row("≈ Light travel", `${ly.toFixed(0)} Mly`) +
    row("Recession", `${(info.z * 299792).toFixed(0)} km/s`);
  document.getElementById("objNote").textContent =
    "Redshift is measured; distance is derived from it via the Planck18 cosmology.";
  document.getElementById("objCredit").textContent =
    "Credit: 2MASS Redshift Survey (Huchra et al. 2012), via VizieR/CDS.";
}

function galaxyPick(h) {
  const ud = h.object.userData;
  if (ud.kind === "galaxy_bh") showGalaxyBHInfo(ud);
  else showGalaxyInfo(ud);
}
function showCMBInfo() {
  const f = cmbL.data.facts;
  openInspector("Cosmic Microwave Background", "surface of last scattering");
  document.getElementById("objTable").innerHTML =
    row("Provenance", `<span class="badge observed">OBSERVED</span>`) +
    row("Temperature", f.temperature) + row("Redshift", f.redshift) +
    row("Emitted", f.emitted) + row("Light travel", f.light_travel) +
    row("Distance", f.comoving_distance) + row("Fluctuations", f.anisotropy_rms) +
    row("Pattern render", `<span class="badge illustrative">PROCEDURAL</span>`);
  document.getElementById("objNote").textContent = f.note;
  document.getElementById("objCredit").textContent = "Credit: " + cmbL.data.provenance.credit;
}

function showGalaxyBHInfo(ud) {
  const bh = ud.data;
  openInspector(bh.name, `central black hole · ${ud.galaxy}`);
  const msun = bh.mass_msun >= 1e6 ? `${(bh.mass_msun / 1e6).toLocaleString()} million M☉`
    : `${bh.mass_msun.toLocaleString()} M☉`;
  document.getElementById("objTable").innerHTML =
    row("Type", `<span class="badge observed">supermassive BH</span>`) +
    row("Host galaxy", ud.galaxy) + row("Mass", msun);
  document.getElementById("objNote").textContent = bh.note || "";
  document.getElementById("objCredit").textContent =
    "Credit: black-hole mass from the published literature. Marker position is illustrative (galaxy centre).";
}

function showGalaxyInfo(ud) {
  const o = ud.data;
  openInspector(o.catalogue === "—" ? o.name : `${o.name} (${o.catalogue})`, o.type);
  document.getElementById("objTable").innerHTML =
    row("Identity", `<span class="badge observed">OBSERVED</span>`) +
    row("Distance", o.distance_mly === 0 ? "our galaxy" : `${o.distance_mly} Mly`) +
    row("Diameter", `${o.diameter_ly.toLocaleString()} ly`) +
    row("Stars", o.stars) +
    row("Morphology", o.morphology.replace(/_/g, " ")) +
    row("Star render", `<span class="badge illustrative">PROCEDURAL</span>`);
  document.getElementById("objNote").textContent = o.note;
  document.getElementById("objCredit").textContent = "Credit: " + o.credit +
    " The 3-D stellar distribution is an illustrative procedural prior.";
}

function showNebulaInfo(ud) {
  const o = ud.data;
  openInspector(`${o.name} (${o.catalogue})`, o.type);
  document.getElementById("objTable").innerHTML =
    row("Identity", `<span class="badge observed">OBSERVED</span>`) +
    row("Distance", `${o.distance_ly.toLocaleString()} ly`) +
    row("Size", `${o.size_ly} ly across`) +
    row("Morphology", o.morphology) +
    row("Embedded stars", `~${o.star_count}`) +
    row("Gas render", `<span class="badge illustrative">PROCEDURAL</span>`);
  document.getElementById("objNote").textContent = o.note;
  document.getElementById("objCredit").textContent = "Credit: " + o.credit +
    " The 3-D gas distribution is an illustrative procedural prior.";
}

function showWormholeInfo(ud) {
  const o = ud.data, f = o.facts;
  openInspector(o.long_name, "theoretical spacetime bridge");
  document.getElementById("objTable").innerHTML =
    row("Provenance", `<span class="badge simulated">THEORETICAL</span>`) +
    row("Status", f.status) + row("Origin", f.origin) +
    row("Traversability", f.traversable) + row("Throat", f.throat);
  document.getElementById("objNote").textContent = f.note;
  document.getElementById("objCredit").textContent = "Credit: " + o.credit;
}

function showBHInfo(ud) {
  const o = ud.data, f = o.facts;
  openInspector(o.long_name, "supermassive black hole");
  document.getElementById("objTable").innerHTML =
    row("Provenance", `<span class="badge observed">OBSERVED</span>`) +
    row("Location", f.location) + row("Mass", f.mass) + row("Distance", f.distance) +
    row("Ring diameter", f.ring_diameter) +
    row("Schwarzschild r", `${o.schwarzschild_km.toLocaleString()} km`) +
    row("Render", `<span class="badge derived">DERIVED approx.</span>`);
  document.getElementById("objNote").textContent = f.note;
  document.getElementById("objCredit").textContent = "Credit: " + o.credit +
    ". Render is a validated real-time approximation (disk + photon ring + Doppler beaming).";
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
  if (cfg.unit === "solar") { const au = Math.pow(halfW / 7, 1 / 0.6); return `~${fmt(2 * au)} AU across`; }
  if (cfg.unit === "exo") { const au = halfW * (exo.unitsPerAU ? 1 / exo.unitsPerAU : 0.1); return `~${fmt(2 * au)} AU across`; }
  if (cfg.unit === "stars") { const pc = halfW; return `~${fmt(2 * pc)} pc (${fmt(2 * pc * 3.262)} ly)`; }
  if (cfg.unit === "cosmic") { const mpc = halfW; return `~${fmt(2 * mpc)} Mpc (${fmt(2 * mpc * 3.262)} Mly)`; }
  if (cfg.unit === "bh") { const rs = halfW / (bh.unitsPerRs || 2.4); return `~${fmt(2 * rs)} Schwarzschild radii`; }
  if (cfg.unit === "nebula") { const ly = halfW * (nebula.objects[nebula.index].size_ly / 18); return `~${fmt(2 * ly)} ly across`; }
  if (cfg.unit === "galaxies") { const ly = halfW * (galaxyL.objects[galaxyL.index].diameter_ly / 68); return `~${fmt(2 * ly)} ly across`; }
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
    for (let i = 0; i < stars.data.count && res.length < 20; i++)
      if ((stars.data.name[i] || "").toLowerCase().includes(ql) || stars.data.source_id[i].includes(ql))
        res.push({ name: stars.data.name[i] || stars.data.source_id[i], sid: stars.data.source_id[i] });
    renderHits(res, box);
  });
}
function renderHits(res, box) {
  box.innerHTML = res.length ? res.map(r => `<div class="hit" data-sid="${r.sid}">${r.name}</div>`).join("")
    : `<div class="hit">no matches</div>`;
  box.querySelectorAll(".hit[data-sid]").forEach(el => el.addEventListener("click", () => {
    const i = stars.data.source_id.indexOf(el.dataset.sid); if (i >= 0) showStarInfo(i);
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
  S.tween = { t: 0, dur: 2.2, fromPos: c.position.clone(), toPos: target.clone().add(offset),
    fromTar: controls.target.clone(), toTar: target.clone(), cam: c, controls, offset, follow: S.surface.follow };
  S.follow = S.surface.follow;
  S.cruise = true;                     // slow drift around the body on arrival
  whoosh(1);
}

function flyToBody(name) {
  solar.showLandmarksFor(null);    // leaving close-up — hide surface landmarks
  S.cruise = false;
  const rec = solar.byName[name];
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
  S.tween = { t: 0, dur: 1.7, fromPos: c.position.clone(), toPos: target.clone().add(offset),
    fromTar: controls.target.clone(), toTar: target.clone(), cam: c, controls, offset, follow: (name !== "Sun") ? name : null };
  S.follow = (name !== "Sun") ? name : null;
  whoosh(1);
}
function flyTo(targetPos, radius, c, controls) {
  const dist = Math.max(radius * 4, 2.5);
  const dir = c.position.clone().sub(controls.target).normalize();
  S.tween = { t: 0, dur: 1.6, fromPos: c.position.clone(), toPos: targetPos.clone().add(dir.multiplyScalar(dist + radius)),
    fromTar: controls.target.clone(), toTar: targetPos.clone(), cam: c, controls };
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
  const drift = !S.reducedMotion && !S.tween &&
    (cruise || performance.now() - lastUser > 12000);
  for (const k in L) {
    L[k].controls.autoRotate = drift && k === S.layer;
    L[k].controls.autoRotateSpeed = (cruise && k === "solar") ? 0.55 : 0.22;
    L[k].controls.update();
  }
  composer.render();
  labelRenderer.render(L[S.layer].scene, L[S.layer].cam);
}
function updateDate() {
  const d = new Date((S.jd - 2440587.5) * 86400000), s = d.toUTCString().slice(5, 16);
  if (s !== _lastDate) { _lastDate = s; document.getElementById("dateLabel").textContent = s + " UTC"; }
}
function onResize() {
  for (const k in L) { L[k].cam.aspect = innerWidth / innerHeight; L[k].cam.updateProjectionMatrix(); }
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
}
