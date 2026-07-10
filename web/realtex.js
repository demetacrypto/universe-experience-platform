// Real planetary texture maps (NASA / observatory-derived), loaded at runtime
// from CORS-enabled CDNs. These replace the procedural textures for the major
// bodies, giving photoreal 2K surfaces. Mapless dwarfs keep procedural.
//   - Earth (2048 colour + normal + specular + clouds + night lights) & Moon: threejs.org
//   - all other planets + Sun + Saturn ring: jeromeetienne/threex.planets (jsDelivr)
import * as THREE from "three";

const TJ = "https://threejs.org/examples/textures/planets/";
// Immutable upstream revision: reproducible assets and no mutable-branch supply-chain drift.
const TX = "https://cdn.jsdelivr.net/gh/jeromeetienne/threex.planets@3de707594b1178ba32c62199bf29efdf90f59cf0/images/";

const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");

export const TEX = {
  Sun:     { map: TX + "sunmap.jpg" },
  Mercury: { map: TX + "mercurymap.jpg", bump: TX + "mercurybump.jpg" },
  Venus:   { map: TX + "venusmap.jpg" },
  Earth:   { map: TJ + "earth_atmos_2048.jpg", normal: TJ + "earth_normal_2048.jpg",
             specular: TJ + "earth_specular_2048.jpg", clouds: TJ + "earth_clouds_1024.png",
             lights: TJ + "earth_lights_2048.png" },
  Mars:    { map: TX + "marsmap1k.jpg", bump: TX + "marsbump1k.jpg" },
  Jupiter: { map: TX + "jupitermap.jpg" },
  Saturn:  { map: TX + "saturnmap.jpg", ring: TX + "saturnringcolor.jpg" },
  Uranus:  { map: TX + "uranusmap.jpg" },
  Neptune: { map: TX + "neptunemap.jpg" },
  Pluto:   { map: TX + "plutomap1k.jpg" },
  Moon:    { map: TJ + "moon_1024.jpg" },
};

let MAX_ANISO = 16;
export function setMaxAnisotropy(v) { MAX_ANISO = v || 16; }

export function load(url, { srgb = true, repeat = false } = {}) {
  const t = loader.load(url);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = MAX_ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

export function hasReal(name) { return !!TEX[name]; }
