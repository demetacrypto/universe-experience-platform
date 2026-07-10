/**
 * Pure presentation helpers shared by the browser UI and its Node unit tests.
 * This module deliberately has no dependency on DOM or WebGL globals.
 */

/** @type {Readonly<Record<string, string>>} */
const HTML_ENTITIES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
});

/**
 * Escapes a value for insertion into HTML text or a quoted HTML attribute.
 * Nullish values intentionally render as empty text.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => HTML_ENTITIES[character] ?? character,
  );
}

/** @typedef {"desktop" | "mobile" | "reduced-motion"} QualityTier */

/**
 * @typedef {object} QualityProfileInput
 * @property {number} viewportWidth
 * @property {number} viewportHeight
 * @property {number} [devicePixelRatio]
 * @property {boolean} [reducedMotion]
 */

/**
 * @typedef {object} QualityProfile
 * @property {QualityTier} tier
 * @property {boolean} isMobile
 * @property {number} pixelRatio
 * @property {boolean} antialias
 * @property {boolean} bloom
 * @property {number} bloomStrength
 * @property {number} particleScale
 * @property {number} maxLabels
 * @property {boolean} autoMotion
 * @property {number} transitionScale
 */

/**
 * @param {number | undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function positiveFinite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Selects a deterministic rendering profile without reading browser globals.
 * A short landscape viewport counts as mobile so phones are not mistaken for
 * desktop just because their long edge exceeds the width breakpoint.
 *
 * @param {QualityProfileInput} input
 * @returns {Readonly<QualityProfile>}
 */
export function getQualityProfile(input) {
  const viewportWidth = positiveFinite(input.viewportWidth, 1024);
  const viewportHeight = positiveFinite(input.viewportHeight, 768);
  const devicePixelRatio = positiveFinite(input.devicePixelRatio, 1);
  const isMobile = viewportWidth <= 900 || viewportHeight <= 480;

  if (input.reducedMotion === true) {
    return Object.freeze({
      tier: "reduced-motion",
      isMobile,
      pixelRatio: Math.min(devicePixelRatio, isMobile ? 1.25 : 1.5),
      antialias: true,
      bloom: false,
      bloomStrength: 0,
      particleScale: isMobile ? 0.3 : 0.45,
      maxLabels: isMobile ? 8 : 16,
      autoMotion: false,
      transitionScale: 0,
    });
  }

  if (isMobile) {
    return Object.freeze({
      tier: "mobile",
      isMobile: true,
      pixelRatio: Math.min(devicePixelRatio, 1.5),
      antialias: true,
      bloom: false,
      bloomStrength: 0,
      particleScale: 0.5,
      maxLabels: 12,
      autoMotion: true,
      transitionScale: 0.85,
    });
  }

  return Object.freeze({
    tier: "desktop",
    isMobile: false,
    pixelRatio: Math.min(devicePixelRatio, 2),
    antialias: true,
    bloom: true,
    bloomStrength: 0.7,
    particleScale: 1,
    maxLabels: 28,
    autoMotion: true,
    transitionScale: 1,
  });
}

const INTERACTIVE_SHORTCUT_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "summary",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[contenteditable]:not([contenteditable='false'])",
].join(",");

/**
 * Global atlas shortcuts must never override a focused native or ARIA control.
 * `closest` also handles icon/text descendants inside an interactive element.
 * Kept DOM-tolerant so the behavior remains unit-testable in Node.
 *
 * @param {unknown} target
 * @returns {boolean}
 */
export function isInteractiveShortcutTarget(target) {
  return Boolean(
    target
    && typeof target === "object"
    && "closest" in target
    && typeof target.closest === "function"
    && target.closest(INTERACTIVE_SHORTCUT_SELECTOR),
  );
}

/** @param {unknown} rendererName */
export function isSoftwareRendererName(rendererName) {
  if (typeof rendererName !== "string") return false;
  return /swiftshader|llvmpipe|software rasterizer|lavapipe/i.test(rendererName);
}

/** @typedef {"observed" | "derived" | "simulated" | "procedural" | "unknown"} ProvenanceKind */
/** @typedef {"observed" | "inferred" | "illustrative" | "neutral"} ProvenanceTone */

/**
 * @typedef {object} ProvenancePresentation
 * @property {ProvenanceKind} kind
 * @property {string} label
 * @property {string} shortLabel
 * @property {string} description
 * @property {ProvenanceTone} tone
 * @property {boolean} isObserved
 */

/**
 * @param {ProvenancePresentation} presentation
 * @returns {Readonly<ProvenancePresentation>}
 */
function freezePresentation(presentation) {
  return Object.freeze(presentation);
}

const UNKNOWN_PROVENANCE = freezePresentation({
  kind: "unknown",
  label: "Provenance unavailable",
  shortLabel: "Unverified",
  description:
    "No recognized source mode was supplied. Treat this visualization as unverified until its source record is available.",
  tone: "neutral",
  isObserved: false,
});

/** @type {Readonly<Record<string, Readonly<ProvenancePresentation>>>} */
const PROVENANCE_PRESENTATIONS = Object.freeze({
  gaia: freezePresentation({
    kind: "observed",
    label: "Observed catalogue · Gaia",
    shortLabel: "Observed",
    description:
      "Catalogue measurements from ESA Gaia; displayed positions and colours may include derived transformations.",
    tone: "observed",
    isObserved: true,
  }),
  "2mrs": freezePresentation({
    kind: "observed",
    label: "Observed catalogue · 2MRS",
    shortLabel: "Observed",
    description:
      "Measured 2MRS redshifts; displayed comoving positions are derived using the declared cosmology.",
    tone: "observed",
    isObserved: true,
  }),
  archive: freezePresentation({
    kind: "observed",
    label: "Observed archive data",
    shortLabel: "Observed",
    description:
      "Measurements from the declared scientific archive; derived values remain identified in each record's provenance.",
    tone: "observed",
    isObserved: true,
  }),
  live_archive: freezePresentation({
    kind: "observed",
    label: "Observed archive data",
    shortLabel: "Observed",
    description:
      "Measurements retrieved from the declared scientific archive during this dataset build; derived fields remain identified in each record's provenance.",
    tone: "observed",
    isObserved: true,
  }),
  bundled_snapshot: freezePresentation({
    kind: "observed",
    label: "Observed archive snapshot · offline",
    shortLabel: "Observed snapshot",
    description:
      "Bundled offline snapshot of published archive measurements; not procedurally generated and not a live query.",
    tone: "observed",
    isObserved: true,
  }),
  observed: freezePresentation({
    kind: "observed",
    label: "Observed data",
    shortLabel: "Observed",
    description:
      "Declared observational data; consult the associated provenance record for archive, release, and transformations.",
    tone: "observed",
    isObserved: true,
  }),
  sample: freezePresentation({
    kind: "procedural",
    label: "Illustrative sample data",
    shortLabel: "Illustrative",
    description:
      "Procedural fallback data for exploration and testing; not an astronomical observation.",
    tone: "illustrative",
    isObserved: false,
  }),
  procedural: freezePresentation({
    kind: "procedural",
    label: "Illustrative procedural data",
    shortLabel: "Illustrative",
    description:
      "Procedurally generated structure; not a measured map of the real universe.",
    tone: "illustrative",
    isObserved: false,
  }),
  derived: freezePresentation({
    kind: "derived",
    label: "Derived data",
    shortLabel: "Derived",
    description:
      "Computed from declared measurements or model inputs; not a direct observation.",
    tone: "inferred",
    isObserved: false,
  }),
  simulated: freezePresentation({
    kind: "simulated",
    label: "Simulation output",
    shortLabel: "Simulated",
    description:
      "Generated by a declared scientific model or simulation; not a direct observation.",
    tone: "inferred",
    isObserved: false,
  }),
});

/**
 * Turns a dataset's source_mode into honest user-facing provenance language.
 * Unknown modes fail closed: they never imply that data is observed.
 *
 * @param {unknown} sourceMode
 * @returns {Readonly<ProvenancePresentation>}
 */
export function getProvenancePresentation(sourceMode) {
  const normalizedMode = typeof sourceMode === "string" ? sourceMode.trim().toLowerCase() : "";
  return PROVENANCE_PRESENTATIONS[normalizedMode] ?? UNKNOWN_PROVENANCE;
}
