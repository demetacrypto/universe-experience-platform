// Shared Three.js scene lifecycle helpers. This module intentionally has no
// Three.js import so its resource-management contract can be tested in Node.

const SHARED_TEXTURES = new WeakSet();

const EQUIRECTANGULAR_PRESETS = Object.freeze({
  low: Object.freeze({ width: 512, height: 256 }),
  medium: Object.freeze({ width: 1024, height: 512 }),
  high: Object.freeze({ width: 2048, height: 1024 }),
});

const PROCEDURAL_TEXTURE_PRESETS = Object.freeze({
  low: Object.freeze({ width: 192, height: 96 }),
  medium: Object.freeze({ width: 256, height: 128 }),
  high: Object.freeze({ width: 512, height: 256 }),
});

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

/** @param {unknown} value @param {number} fallback @param {number} minimum @param {number} maximum */
function clampInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

/** @param {any} resource @param {WeakSet<object>} disposed */
function disposeOnce(resource, disposed) {
  if (!isObject(resource) || typeof resource.dispose !== "function" || disposed.has(resource)) return;
  disposed.add(resource);
  resource.dispose();
}

/** @param {any} value @param {WeakSet<object>} disposed */
function disposeTextureCandidate(value, disposed) {
  if (Array.isArray(value)) {
    for (const item of value) disposeTextureCandidate(item, disposed);
    return;
  }
  if (!isObject(value) || value.isTexture !== true || SHARED_TEXTURES.has(value)) return;
  disposeOnce(value, disposed);
}

/** @param {any} material @param {WeakSet<object>} disposed */
function disposeMaterial(material, disposed) {
  if (!isObject(material) || disposed.has(material)) return;

  for (const value of Object.values(material)) disposeTextureCandidate(value, disposed);
  if (isObject(material.uniforms)) {
    for (const uniform of Object.values(material.uniforms)) {
      disposeTextureCandidate(uniform?.value, disposed);
    }
  }
  disposeOnce(material, disposed);
}

/**
 * Mark a texture as application-shared so rebuilding one scene does not release
 * a resource that another scene still uses.
 * @param {any} texture
 */
export function markSharedTexture(texture) {
  if (isObject(texture)) SHARED_TEXTURES.add(texture);
  return texture;
}

/**
 * Release GPU-backed geometry, materials and owned textures in an Object3D tree.
 * Shared textures registered through markSharedTexture are deliberately retained.
 */
/** @param {any} root */
export function disposeObject3D(root) {
  if (!isObject(root)) return;
  const disposed = new WeakSet();
  /** @param {any} object */
  const visit = (object) => {
    if (!isObject(object)) return;
    disposeOnce(object.geometry, disposed);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) disposeMaterial(material, disposed);
  };

  if (typeof root.traverse === "function") root.traverse(visit);
  else visit(root);
}

/**
 * Resolve an equirectangular texture budget. Explicit dimensions win; otherwise
 * quality presets offer predictable mobile/desktop memory and generation costs.
 */
/**
 * @param {{quality?: string, width?: number, height?: number} | null} [options]
 */
export function resolveEquirectangularTextureSize(options = {}) {
  const safeOptions = isObject(options) ? options : {};
  const requestedQuality = safeOptions.quality ?? "high";
  const preset = requestedQuality === "low" ? EQUIRECTANGULAR_PRESETS.low
    : requestedQuality === "high" ? EQUIRECTANGULAR_PRESETS.high : EQUIRECTANGULAR_PRESETS.medium;
  const width = clampInteger(safeOptions.width, preset.width, 256, 4096);
  const defaultHeight = safeOptions.width == null ? preset.height : Math.round(width / 2);
  const height = clampInteger(safeOptions.height, defaultHeight, 128, 2048);
  return { width, height };
}

/**
 * Keeps synchronous procedural body textures compact. These maps are used for
 * small fallback bodies, not the externally sourced major-planet imagery.
 * @param {{quality?: string} | null} [options]
 */
export function resolveProceduralTextureSize(options = {}) {
  const quality = isObject(options) ? options.quality : "medium";
  const preset = quality === "low" ? PROCEDURAL_TEXTURE_PRESETS.low
    : quality === "high" ? PROCEDURAL_TEXTURE_PRESETS.high
      : PROCEDURAL_TEXTURE_PRESETS.medium;
  return { width: preset.width, height: preset.height };
}

/**
 * Wrap an expensive synchronous initializer so it runs only when first used.
 * Failed initializations remain retryable and successful values are stable.
 * @template T
 * @param {() => T} initialize
 */
export function createLazyInitializer(initialize) {
  let initialized = false;
  /** @type {T | undefined} */
  let value;
  return Object.freeze({
    get initialized() { return initialized; },
    peek() { return initialized ? value : undefined; },
    ensure() {
      if (initialized) return value;
      const nextValue = initialize();
      value = nextValue;
      initialized = true;
      return value;
    },
  });
}
