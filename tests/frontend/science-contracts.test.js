import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { shadowRadiusRs } from "../../web/blackhole.js";
import {
  centralBlackHoleIsDetected,
  centralBlackHoleIsUpperLimit,
} from "../../web/galaxymodel.js";
import { WORMHOLE } from "../../web/wormhole.js";

describe("black-hole render scale", () => {
  test("normalizes the measured shadow diameter to Schwarzschild-radius scene units", () => {
    assert.equal(shadowRadiusRs({ shadow_diameter_rs: 5.2 }), 2.6);
    assert.equal(shadowRadiusRs({ shadow_diameter_rs: 4.8 }), 2.4);
  });

  test("uses a finite conservative fallback for malformed legacy payloads", () => {
    assert.equal(shadowRadiusRs({ shadow_diameter_rs: -2 }), 2.6);
    assert.equal(shadowRadiusRs({}), 2.6);
  });
});

describe("galaxy central-object evidence", () => {
  test("does not turn a non-detection upper limit into a black-hole marker", () => {
    const constraint = {
      name: "M33 core",
      status: "upper_limit",
      detected: false,
      mass_upper_limit_msun: 3000,
      note: "No classical SMBH detected.",
    };

    assert.equal(centralBlackHoleIsUpperLimit(constraint), true);
    assert.equal(centralBlackHoleIsDetected(constraint), false);
  });

  test("keeps a measured central black hole eligible for a marker", () => {
    const measured = { name: "M31*", detected: true, mass_msun: 140_000_000 };

    assert.equal(centralBlackHoleIsUpperLimit(measured), false);
    assert.equal(centralBlackHoleIsDetected(measured), true);
  });

  test("recognizes the legacy upper-limit note without claiming a detection", () => {
    const legacy = {
      name: "M33 core",
      mass_msun: 3000,
      note: "No classical SMBH detected — only a low upper limit.",
    };

    assert.equal(centralBlackHoleIsUpperLimit(legacy), true);
    assert.equal(centralBlackHoleIsDetected(legacy), false);
  });
});

test("wormhole metadata distinguishes the traversable model from an Einstein-Rosen bridge", () => {
  assert.match(WORMHOLE.long_name, /Morris.Thorne traversable wormhole/i);
  assert.match(WORMHOLE.facts.distinction, /Einstein.Rosen.*non.traversable/i);
});
