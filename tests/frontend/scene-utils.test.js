// Node-only regression coverage for scene lifecycle and texture quality helpers.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createLazyInitializer,
  disposeObject3D,
  markSharedTexture,
  resolveEquirectangularTextureSize,
  resolveProceduralTextureSize,
} from "../../web/scene-utils.js";

function disposable(extra = {}) {
  return {
    calls: 0,
    dispose() {
      this.calls += 1;
    },
    ...extra,
  };
}

function objectTree(nodes) {
  return {
    traverse(visitor) {
      for (const node of nodes) visitor(node);
    },
  };
}

test("disposeObject3D releases owned geometry, materials, and textures once", () => {
  const geometry = disposable();
  const map = disposable({ isTexture: true });
  const uniformMap = disposable({ isTexture: true });
  const material = disposable({
    map,
    alphaMap: map,
    uniforms: { backdrop: { value: uniformMap } },
  });
  const tree = objectTree([
    { geometry, material },
    { geometry, material: [material, material] },
  ]);

  disposeObject3D(tree);

  assert.equal(geometry.calls, 1);
  assert.equal(material.calls, 1);
  assert.equal(map.calls, 1);
  assert.equal(uniformMap.calls, 1);
});

test("disposeObject3D preserves explicitly shared textures", () => {
  const sharedMap = markSharedTexture(disposable({ isTexture: true }));
  const material = disposable({ map: sharedMap });

  disposeObject3D(objectTree([{ material }]));

  assert.equal(material.calls, 1);
  assert.equal(sharedMap.calls, 0);
});

test("disposeObject3D tolerates missing and partial scene objects", () => {
  assert.doesNotThrow(() => disposeObject3D(null));
  assert.doesNotThrow(() => disposeObject3D({}));
  assert.doesNotThrow(() => disposeObject3D(objectTree([{}, { material: null }])));
});

test("resolveEquirectangularTextureSize maps quality presets", () => {
  assert.deepEqual(resolveEquirectangularTextureSize(), {
    width: 2048,
    height: 1024,
  });
  assert.deepEqual(resolveEquirectangularTextureSize({ quality: "low" }), {
    width: 512,
    height: 256,
  });
  assert.deepEqual(resolveEquirectangularTextureSize({ quality: "medium" }), {
    width: 1024,
    height: 512,
  });
  assert.deepEqual(resolveEquirectangularTextureSize({ quality: "high" }), {
    width: 2048,
    height: 1024,
  });
});

test("resolveEquirectangularTextureSize clamps explicit overrides", () => {
  assert.deepEqual(
    resolveEquirectangularTextureSize({ width: 900, height: 420 }),
    { width: 900, height: 420 },
  );
  assert.deepEqual(
    resolveEquirectangularTextureSize({ width: 32, height: 9000 }),
    { width: 256, height: 2048 },
  );
  assert.deepEqual(
    resolveEquirectangularTextureSize({ quality: "unknown" }),
    { width: 1024, height: 512 },
  );
});

test("createLazyInitializer constructs a value exactly once on demand", () => {
  let calls = 0;
  const lazy = createLazyInitializer(() => ({ sequence: ++calls }));

  assert.equal(lazy.initialized, false);
  assert.equal(lazy.peek(), undefined);
  assert.deepEqual(lazy.ensure(), { sequence: 1 });
  assert.equal(lazy.initialized, true);
  assert.deepEqual(lazy.ensure(), { sequence: 1 });
  assert.equal(calls, 1);
});

test("createLazyInitializer retries after a failed construction", () => {
  let calls = 0;
  const lazy = createLazyInitializer(() => {
    calls += 1;
    if (calls === 1) throw new Error("first attempt");
    return "ready";
  });

  assert.throws(() => lazy.ensure(), /first attempt/);
  assert.equal(lazy.initialized, false);
  assert.equal(lazy.ensure(), "ready");
  assert.equal(calls, 2);
});

test("resolveProceduralTextureSize keeps boot textures intentionally compact", () => {
  assert.deepEqual(resolveProceduralTextureSize(), { width: 256, height: 128 });
  assert.deepEqual(resolveProceduralTextureSize({ quality: "low" }), { width: 192, height: 96 });
  assert.deepEqual(resolveProceduralTextureSize({ quality: "high" }), { width: 512, height: 256 });
});
