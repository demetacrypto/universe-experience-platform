import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  escapeHtml,
  getProvenancePresentation,
  getQualityProfile,
  isInteractiveShortcutTarget,
  isSoftwareRendererName,
} from "../../web/ui-utils.js";

describe("escapeHtml", () => {
  test("escapes every character that can break HTML text or quoted attributes", () => {
    assert.equal(
      escapeHtml(`<script data-label="A&B">'unsafe'</script>`),
      "&lt;script data-label=&quot;A&amp;B&quot;&gt;&#39;unsafe&#39;&lt;/script&gt;",
    );
  });

  test("leaves ordinary scientific labels unchanged", () => {
    assert.equal(escapeHtml("Andromeda Galaxy (M31)"), "Andromeda Galaxy (M31)");
  });

  test("renders nullish values as empty text", () => {
    assert.deepEqual([escapeHtml(null), escapeHtml(undefined)], ["", ""]);
  });

  test("converts non-string scalar values before escaping", () => {
    assert.equal(escapeHtml(2.725), "2.725");
  });
});

describe("getQualityProfile", () => {
  test("returns the full desktop profile and caps high-density displays", () => {
    assert.deepEqual(
      getQualityProfile({
        viewportWidth: 1728,
        viewportHeight: 1117,
        devicePixelRatio: 3,
        reducedMotion: false,
      }),
      {
        tier: "desktop",
        isMobile: false,
        pixelRatio: 2,
        antialias: true,
        bloom: true,
        bloomStrength: 0.7,
        particleScale: 1,
        maxLabels: 28,
        autoMotion: true,
        transitionScale: 1,
      },
    );
  });

  test("returns a restrained profile for portrait mobile viewports", () => {
    assert.deepEqual(
      getQualityProfile({
        viewportWidth: 390,
        viewportHeight: 844,
        devicePixelRatio: 3,
      }),
      {
        tier: "mobile",
        isMobile: true,
        pixelRatio: 1.5,
        antialias: true,
        bloom: false,
        bloomStrength: 0,
        particleScale: 0.5,
        maxLabels: 12,
        autoMotion: true,
        transitionScale: 0.85,
      },
    );
  });

  test("detects a short landscape viewport as mobile", () => {
    assert.equal(
      getQualityProfile({ viewportWidth: 844, viewportHeight: 390 }).tier,
      "mobile",
    );
  });

  test("uses the same 900px mobile boundary as the responsive shell", () => {
    assert.equal(
      getQualityProfile({ viewportWidth: 850, viewportHeight: 844 }).tier,
      "mobile",
    );
    assert.equal(
      getQualityProfile({ viewportWidth: 900, viewportHeight: 700 }).tier,
      "mobile",
    );
    assert.equal(
      getQualityProfile({ viewportWidth: 901, viewportHeight: 700 }).tier,
      "desktop",
    );
  });

  test("keeps the short-landscape accessibility shell active above 900px", () => {
    assert.equal(
      getQualityProfile({ viewportWidth: 1000, viewportHeight: 450 }).tier,
      "mobile",
    );
  });

  test("reduced motion overrides the desktop motion and post-processing profile", () => {
    assert.deepEqual(
      getQualityProfile({
        viewportWidth: 1440,
        viewportHeight: 900,
        devicePixelRatio: 2,
        reducedMotion: true,
      }),
      {
        tier: "reduced-motion",
        isMobile: false,
        pixelRatio: 1.5,
        antialias: true,
        bloom: false,
        bloomStrength: 0,
        particleScale: 0.45,
        maxLabels: 16,
        autoMotion: false,
        transitionScale: 0,
      },
    );
  });

  test("uses safe defaults for invalid viewport metrics", () => {
    const profile = getQualityProfile({
      viewportWidth: Number.NaN,
      viewportHeight: -1,
      devicePixelRatio: Number.POSITIVE_INFINITY,
    });

    assert.deepEqual(
      { tier: profile.tier, pixelRatio: profile.pixelRatio },
      { tier: "desktop", pixelRatio: 1 },
    );
  });

  test("returns an immutable profile", () => {
    assert.equal(
      Object.isFrozen(getQualityProfile({ viewportWidth: 1280, viewportHeight: 720 })),
      true,
    );
  });
});

describe("isInteractiveShortcutTarget", () => {
  test("recognizes native, role-based, and editable controls", () => {
    for (const selector of ["button", "a[href]", "[role='button']", "[contenteditable]"]) {
      const target = { closest: () => ({ matches: selector }) };
      assert.equal(isInteractiveShortcutTarget(target), true);
    }
  });

  test("allows global shortcuts from non-interactive scene targets", () => {
    assert.equal(isInteractiveShortcutTarget({ closest: () => null }), false);
    assert.equal(isInteractiveShortcutTarget(null), false);
  });
});

describe("isSoftwareRendererName", () => {
  test("detects common software WebGL renderers without flagging hardware GPUs", () => {
    assert.equal(isSoftwareRendererName("ANGLE (Google, Vulkan 1.3 SwiftShader Device)"), true);
    assert.equal(isSoftwareRendererName("llvmpipe (LLVM 17.0.6)"), true);
    assert.equal(isSoftwareRendererName("Apple M3 Max"), false);
    assert.equal(isSoftwareRendererName(undefined), false);
  });
});

describe("getProvenancePresentation", () => {
  test("identifies Gaia catalogue data as observed without calling it live", () => {
    assert.deepEqual(getProvenancePresentation("gaia"), {
      kind: "observed",
      label: "Observed catalogue · Gaia",
      shortLabel: "Observed",
      description:
        "Catalogue measurements from ESA Gaia; displayed positions and colours may include derived transformations.",
      tone: "observed",
      isObserved: true,
    });
  });

  test("identifies 2MRS measurements while disclosing derived spatial placement", () => {
    const presentation = getProvenancePresentation(" 2MRS ");

    assert.deepEqual(
      {
        kind: presentation.kind,
        label: presentation.label,
        description: presentation.description,
      },
      {
        kind: "observed",
        label: "Observed catalogue · 2MRS",
        description:
          "Measured 2MRS redshifts; displayed comoving positions are derived using the declared cosmology.",
      },
    );
  });

  test("treats archive mode as observed but does not invent a specific archive", () => {
    const presentation = getProvenancePresentation("ARCHIVE");

    assert.deepEqual(
      { label: presentation.label, isObserved: presentation.isObserved },
      { label: "Observed archive data", isObserved: true },
    );
  });

  test("identifies a live archive ingest as observed without implying permanent live status", () => {
    const presentation = getProvenancePresentation("live_archive");

    assert.deepEqual(
      {
        label: presentation.label,
        isObserved: presentation.isObserved,
        description: presentation.description,
      },
      {
        label: "Observed archive data",
        isObserved: true,
        description:
          "Measurements retrieved from the declared scientific archive during this dataset build; derived fields remain identified in each record's provenance.",
      },
    );
  });

  test("identifies bundled measurements as an observed offline snapshot", () => {
    assert.deepEqual(getProvenancePresentation("bundled_snapshot"), {
      kind: "observed",
      label: "Observed archive snapshot · offline",
      shortLabel: "Observed snapshot",
      description:
        "Bundled offline snapshot of published archive measurements; not procedurally generated and not a live query.",
      tone: "observed",
      isObserved: true,
    });
  });

  test("labels sample fallback data as illustrative rather than observed", () => {
    assert.deepEqual(getProvenancePresentation("sample"), {
      kind: "procedural",
      label: "Illustrative sample data",
      shortLabel: "Illustrative",
      description:
        "Procedural fallback data for exploration and testing; not an astronomical observation.",
      tone: "illustrative",
      isObserved: false,
    });
  });

  test("labels a procedural cosmic web as illustrative", () => {
    const presentation = getProvenancePresentation("procedural");

    assert.match(presentation.description, /not a measured map/i);
  });

  test("keeps derived and simulated modes distinct from direct observations", () => {
    assert.deepEqual(
      [getProvenancePresentation("derived"), getProvenancePresentation("simulated")].map(
        ({ kind, isObserved }) => ({ kind, isObserved }),
      ),
      [
        { kind: "derived", isObserved: false },
        { kind: "simulated", isObserved: false },
      ],
    );
  });

  test("falls back to an explicitly unverified presentation for unknown modes", () => {
    assert.deepEqual(getProvenancePresentation("mystery-catalogue"), {
      kind: "unknown",
      label: "Provenance unavailable",
      shortLabel: "Unverified",
      description:
        "No recognized source mode was supplied. Treat this visualization as unverified until its source record is available.",
      tone: "neutral",
      isObserved: false,
    });
  });

  test("does not crash or imply observation when source mode is absent", () => {
    assert.equal(getProvenancePresentation(undefined).isObserved, false);
  });

  test("returns an immutable presentation", () => {
    assert.equal(Object.isFrozen(getProvenancePresentation("gaia")), true);
  });
});
