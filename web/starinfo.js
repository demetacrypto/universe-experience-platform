// Derived stellar properties + famous-star facts for the data-inspection card.
// Temperature & spectral class are ESTIMATED from the measured Gaia BP–RP colour
// (a real but approximate relation) — flagged as derived, not measured.

// Approximate effective temperature from Gaia BP–RP colour (K).
export function tempFromBpRp(bp_rp) {
  if (bp_rp == null) return null;
  // smooth empirical-ish fit across the main sequence range
  const c = Math.max(-0.3, Math.min(5, bp_rp));
  return Math.round(4600 * (1 / (0.92 * c + 1.7) + 1 / (0.92 * c + 0.62)));
}

export function spectralClass(teff) {
  if (teff == null) return null;
  if (teff >= 30000) return "O (blue)";
  if (teff >= 10000) return "B (blue-white)";
  if (teff >= 7500) return "A (white)";
  if (teff >= 6000) return "F (yellow-white)";
  if (teff >= 5200) return "G (yellow, Sun-like)";
  if (teff >= 3700) return "K (orange)";
  return "M (red dwarf)";
}

// A handful of famous stars get a richer description + constellation.
export const STAR_FACTS = {
  "Sirius": { con: "Canis Major", note: "The brightest star in the night sky; a hot A-type star with a white-dwarf companion." },
  "Canopus": { con: "Carina", note: "Second-brightest star in the sky; a luminous yellow-white supergiant." },
  "Arcturus": { con: "Boötes", note: "A red giant racing through the galaxy at 122 km/s relative to the Sun." },
  "Vega": { con: "Lyra", note: "Was the northern pole star ~12,000 BC and will be again ~13,700 AD." },
  "Capella": { con: "Auriga", note: "Actually two pairs of binary stars — four stars in one bright point." },
  "Rigel": { con: "Orion", note: "A blue supergiant ~120,000× more luminous than the Sun." },
  "Procyon": { con: "Canis Minor", note: "One of our nearest stellar neighbours, with a white-dwarf companion." },
  "Betelgeuse": { con: "Orion", note: "A red supergiant so large it would swallow Jupiter's orbit; a future supernova." },
  "Altair": { con: "Aquila", note: "Spins so fast (one day ≈ 9 hours) it is flattened into an ellipsoid." },
  "Aldebaran": { con: "Taurus", note: "An orange giant that marks the eye of the bull." },
  "Antares": { con: "Scorpius", note: "A red supergiant — its name means 'rival of Mars' for its reddish glow." },
  "Spica": { con: "Virgo", note: "A close pair of hot blue stars orbiting every four days." },
  "Pollux": { con: "Gemini", note: "An orange giant — the nearest giant star to the Sun, with a known planet." },
  "Fomalhaut": { con: "Piscis Austrinus", note: "Encircled by a dusty debris ring imaged by Hubble." },
  "Deneb": { con: "Cygnus", note: "One of the most luminous stars known — a distant blue-white supergiant." },
  "Regulus": { con: "Leo", note: "A fast-spinning blue star at the heart of the lion." },
  "Alpha Centauri": { con: "Centaurus", note: "The closest star system to the Sun, 4.37 light-years away." },
  "Proxima Centauri": { con: "Centaurus", note: "The single closest star to the Sun; hosts a planet in its habitable zone." },
  "Barnard's Star": { con: "Ophiuchus", note: "A red dwarf with the largest known proper motion across our sky." },
  "Tau Ceti": { con: "Cetus", note: "A nearby Sun-like star long studied in the search for other Earths." },
  "Polaris": { con: "Ursa Minor", note: "The current North Star — a Cepheid variable supergiant." },
};
