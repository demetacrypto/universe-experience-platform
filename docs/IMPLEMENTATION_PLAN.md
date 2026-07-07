# Universe Experience Platform — End-to-End Implementation Plan

This plan takes the *Practical Guide to Building a Scientifically Grounded
Universe Experience Platform* from concept to a maintained, launched product —
**every phase to the last step** — and adds the features the guide left out (see
§9, Feature Gap Analysis). It is written against the working foundation already
in this repository (Phase 0–1 complete).

---

## 1. Strategy in one page

Build an **interactive scientific universe atlas**, not a "game map of
everything". Four design commitments drive every decision:

1. **Observation-first** — use authoritative catalogues/archives where real
   measurements exist; simulate or proceduralise only to fill *declared* gaps.
2. **Provenance everywhere** — every renderable entity carries a `source_type`,
   `confidence`, `distance_method`, `uncertainty`, `dataset_release`, and credit.
3. **Layered universe** — four+ representations (cosmological, galaxy/halo,
   stellar neighbourhood, high-fidelity local scenes), each with its own physics,
   LOD policy, and render budget.
4. **One authoritative backend, multiple front ends** — desktop/web first, then
   VR; Unreal Engine 5 premium client + WebGPU broad-reach client over a single
   science backbone.

**Lowest-risk path:** scientific backbone first, premium immersion second. The
first serious milestone is a *validated universe slice* from real archives with
provenance that moves seamlessly across several orders of magnitude — **which
this repo now demonstrates with Gaia DR3.**

---

## 2. Target architecture

```
            ARCHIVES                        SCIENCE PIPELINE                 DELIVERY                CLIENTS
  Gaia · SIMBAD · VizieR · NED        ┌────────────────────────────┐   ┌───────────────────┐   ┌────────────────────┐
  SDSS · Pan-STARRS · WISE/2MASS  ──► │ ingest (Astroquery/TAP/VO) │   │  Metadata/Query    │   │ WebGPU web client  │
  MAST · HEASARC · IllustrisTNG       │ provenance attach          │──►│  API (GraphQL/REST)│◄─►│ (Three.js/Babylon) │
  FIRE-2 · CAMELS · Euclid            │ coords (Astropy, Planck18) │   │                    │   │                    │
                                      │ HEALPix/MOC/HATS partition │   │  Chunk-stream API  │   │ Unreal Engine 5    │
                                      │ curate (Parquet/Zarr)      │   │  (gRPC / HTTP range)│◄─►│ premium + OpenXR VR│
                                      │ deliver (glTF/KTX/VDB/JSON)│   └─────────┬─────────┘   │                    │
                                      └──────────┬─────────────────┘             │             │ Mobile tour/AR     │
                                                 │                               │             └────────────────────┘
                            ┌────────────────────▼───────────────┐    ┌─────────▼──────────┐
                            │  THREE-ZONE DATA LAKE (object store)│    │ Provenance/search  │
                            │  raw (FITS/HDF5) · curated (Parquet/│    │ metadata store     │
                            │  Zarr) · delivery (tiles/assets/VDB)│    │ (doc + graph)      │
                            └─────────────────────────────────────┘    └────────────────────┘
```

Cloud-native but not cloud-dependent: science lake + scheduled transforms in one
primary cloud/HPC; public runtime assets behind an edge CDN (e.g. Cloudflare R2,
egress-free) to control the dominant cost (egress + always-on GPU).

---

## 3. The layered universe (build order within each phase)

| Layer | Distance regime | Primary data | Representation | Status |
|---|---|---|---|---|
| **L0 Solar System** *(added — see §9)* | AU | JPL Keplerian elements (→ Horizons/SPICE) | textured meshes + ephemerides | ✅ prototype |
| **L1 Stellar neighbourhood** | pc–kpc | Gaia DR3, WISE/2MASS | points/sprites | ✅ prototype |
| **L2 Milky Way** | kpc | Gaia + IR dust maps | points + sparse volumes | planned |
| **L1.5 Exoplanets** *(added)* | pc | NASA Exoplanet Archive | per-system orbital scenes + HZ | ✅ prototype |
| **L3 Galaxy / halo** | Mpc | famous galaxies (→ NED, SDSS, TNG mocks) | procedural morphology models | ✅ prototype |
| **L4 Cosmological** | Gpc / redshift | 2MRS redshifts (→ SDSS, Euclid) | comoving point cloud | ✅ prototype |
| **L6 CMB** *(edge of observable universe)* | z≈1089 | Planck/WMAP/COBE params | all-sky last-scattering shell | ✅ prototype |
| **L5 High-fidelity local scenes** | scene | EHT (M87*/Sgr A*), nebulae (VDB), deep fields (MAST) | ray-traced / volumetric | ✅ black holes + nebulae prototyped |

Each layer declares its own LOD policy: HEALPix/HATS streaming on the sky;
octree/BVH in 3D scenes; billboard → impostor → point cloud → proxy mesh →
detailed mesh → sparse volume per node.

---

## 4. Phased roadmap (to the last step)

### Phase 0 — Foundations ✅ *(done in this repo)*
Provenance truth model; Astropy coordinate/cosmology engine; HEALPix
partitioning; three-zone lake; QA harness. **Exit:** tests green, contracts fixed.

### Phase 1 — Validated universe slice ✅ *(done in this repo)*
Live Gaia DR3 ingestion (+offline fallback); curated Parquet + delivery tiles +
scene bundle; FastAPI metadata/tile API; WebGPU-detecting Three.js client with
provenance & uncertainty UI; SIMBAD-style name resolver. **Exit:** a real,
provenance-correct stellar neighbourhood you can fly through and inspect.

> **Prototype status:** the multi-archive **adapter framework** (SIMBAD/NED/VizieR/MAST with a
> federated resolver), **API security** (rate limiting, security headers, object-level rights),
> **CI + golden scenes**, and **Docker/compose deploy** are now scaffolded as working code
> (43 tests). What remains in Phases 2/5 is breadth (more archive adapters & the Zarr/graph
> stores) and depth (Redis-backed limits, signed URLs, full WCAG audit, FinOps automation).

### Phase 2 — Multi-archive backbone & extragalactic layer (≈ months 2–6)
- Add Astroquery adapters for **SIMBAD, VizieR, NED, SDSS DR19, Pan-STARRS
  (MAST), WISE/2MASS (IRSA), MAST, HEASARC** with per-archive parsers.
- Promote curated arrays to **Zarr** for chunked image/volume reads; add a
  **document+graph metadata store** for object identity, cross-IDs, bibliography.
- Build the **galaxy/halo layer (L3)** keyed on NED identities; redshift→distance
  via Astropy; first **comoving cosmological layer (L4)**.
- Replace JSON tiles with **glTF + KTX 2.0 + Draco** delivery and **MOC** coverage
  metadata; introduce gRPC / HTTP-range chunk streaming.
- **Exit:** seamless transition Sun → Galactic centre → nearby galaxies, all
  archive-backed with provenance and rights flags honoured.

### Phase 3 — Simulation gap-filling & local scenes (≈ months 5–10)
- Ingest **IllustrisTNG** mock deep fields & group catalogues, **FIRE-2** zoom-ins,
  **CAMELS** ensembles; flag all as `simulated`/`modelled`.
- **Conditional procedural fill** constrained by the nearest observational layer
  (dwarf-galaxy libraries by measured redshift/mass; IR-informed dust lanes);
  every fill carries a confidence class.
- **Nebulae / gas as sparse volumes** (OpenVDB → runtime voxel grids; ray-marched).
- **Black-hole / relativistic reference path**: geodesic ray tracing + GRMHD-
  informed inputs validated against **EHT M87 / Sgr A\*** imagery; real-time path
  uses validated approximations (Kerr shadow templates, Doppler beaming,
  lensing maps) *fit to the truth renderer* (EinsteinPy for prototyping only).
- **Exit:** showcase scenes (deep field, nebula, black hole) that are validated,
  not artist-invented.

### Phase 4 — Premium client & XR (≈ months 8–16)
- **Unreal Engine 5** flagship client: Nanite virtualised geometry, Lumen GI,
  HDRP-class volumetrics; floating-origin local spaces fed by the same backend.
- **OpenXR** desktop/VR; **WebXR** for the browser; reduced-motion + guided modes.
- Shared **scene-graph contract** so UE5 and WebGPU clients render the same
  scientific scene from the same delivery assets.
- **Exit:** premium immersive build at parity with the web client's science model.

### Phase 5 — Hardening, validation & public beta (≈ months 14–20)
- **Golden scenes & golden queries** in CI (Solar-neighbourhood cube, MW bulge IR
  comparison, galaxy drill-down vs NED/SDSS, deep field vs MAST, EHT black hole).
- **Security**: OWASP API Top-10 controls, object-level authorisation against
  rights metadata, signed URLs, resource-consumption limits, OAuth2/OIDC.
- **Accessibility**: WCAG 2.2 AA on desktop/web; captions, keyboard-only
  inspection, high-contrast panels; sonification (see §9).
- **FinOps guardrails** (see §9): batch GPU windows, Spot/preemptible, hot/cold
  tiering, autoscale-to-zero, egress budgets + alerts.
- **Exit:** public beta with versioned, pinnable data releases.

### Phase 6 — Launch & long-term maintenance (ongoing)
Versioned, immutable, citeable data releases with blue/green or canary rollout;
nightly/weekly ingestion into a `latest` channel that never corrupts published
scenes. Four durable practices: keep the **provenance graph** healthy, keep
**asset builders** repeatable (re-tiling), keep the **benchmark pack** alive, keep
the **public uncertainty language** in the UI.

---

## 5. Technology choices (locked recommendations)

- **Science/data:** Python — Astropy, Astroquery, DuckDB/Polars, Dask/Ray;
  LSDB/HATS patterns for billion-source partitioning.
- **Storage:** object store + raw FITS/HDF5; curated Parquet/Zarr; delivery
  glTF/KTX/Draco + OpenVDB; document+graph metadata store.
- **Spatial index:** HEALPix + MOC + HATS on the sky; octree/BVH in 3D scenes.
- **Premium client:** Unreal Engine 5 (Nanite/Lumen). **Broad reach:** WebGPU +
  Babylon.js or Three.js. **Low-budget alt:** Godot 4.
- **APIs:** GraphQL for metadata/search; gRPC or tuned HTTP-range for chunks.
- **Cloud:** AWS or GCP primary substrate; Cloudflare R2 + Workers edge for
  egress-free public delivery.

---

## 6. Team (medium-scope build)

Astrophysics lead · data/science-platform engineer · graphics lead · 1–2
real-time engine engineers · backend/API engineer · technical artist / procedural
specialist · UX designer with scivis literacy · QA/automation engineer. Add
DevOps/platform early for multi-platform/public beta; add a compact-object
physics specialist + part-/full-time HPC engineer for relativistic or custom
simulation work.

---

## 7. Cost model (planning estimates, from the guide)

| Scenario | Scope | Team & duration | Data estate | Cloud run-rate | Programme budget |
|---|---|---|---|---|---|
| **Low** | Desktop/web MVP; MW + selected galaxies + tours; VR deferred | 6–8 FTE, 9–12 mo | 10–50 TB | ~$2k–15k/mo | ~$0.8M–1.8M |
| **Medium** | Production desktop+web, observation-first, selective relativistic scenes, optional VR beta | 10–16 FTE, 12–18 mo | 100–500 TB | ~$15k–80k/mo | ~$2.5M–6M |
| **High** | Flagship multi-platform, enterprise provenance, multiple premium scenes, global delivery, custom sim | 18–30 FTE, 18–30 mo | 0.5–3 PB | ~$100k–500k+/mo | ~$8M–25M+ |

**Cost levers:** keep raw data cold, curated tiles hot; minimise egress; run GPUs
in batch windows; use Spot/preemptible where safe; never recompute derived
delivery assets.

---

## 8. Validation & operations (three simultaneous levels)

1. **Data correctness** — identifiers, coordinates, units, WCS, rights metadata.
2. **Physical plausibility** — consistency with literature and chosen
   cosmology / relativistic model.
3. **Experiential integrity** — coherent, performant, honest scale transitions.

Every curated dataset gets a source manifest, transform version, and output
signature; FITS/WCS get dedicated regression tests; rendering gets a benchmark
suite (frame time, memory, streaming stutter, tile-decode latency) across
representative hardware tiers, including WebGPU capability-detection and
graceful-degradation paths. *(This repo's `tests/` implements the prototype-scale
version of all three.)*

---

## 9. Feature Gap Analysis — what the guide missed (added here)

The guide is strong on data, rendering, and cosmology but under-specifies several
features a true "experience the **entire** universe" product needs. These are
added to the plan, with priority.

| # | Added feature | Why it's needed | Priority |
|---|---|---|---|
| 1 | **Solar System layer (L0)** — planets, moons, small bodies via **JPL Horizons / SPICE** ephemerides | Users expect to start at *home*; the guide jumps straight to stars. Biggest narrative gap. | **High** |
| 2 | **Exoplanet layer** — NASA Exoplanet Archive systems, habitable-zone overlays | Highest public-engagement content; trivial to add, large payoff. | **High** |
| 3 | **Time-domain / events layer** — light curves, variables, supernovae, transients; a *time machine* scrubber | Guide mentions time-domain data but defines no module; powers "as seen vs now". | **High** |
| 4 | **Provenance & citation ledger** — auto-export the exact bibliography/acknowledgements for any scene | Turns the provenance payload into research-grade output and guarantees rights compliance. | **High** |
| 5 | **FinOps guardrails** — egress budgets+alerts, GPU batch windows, autoscale-to-zero, tier policies as code | Guide lists cost *levers* but no enforcement; run-cost is the top failure mode. | **High** |
| 6 | **Data-freshness monitor & ingest scheduler** — detect archive changes, re-validate, re-tile | Archives evolve (e.g. Gaia DR4 prep); scenes must pin to immutable releases. | **High** |
| 7 | **AI-assisted navigation & explanation** — natural-language "take me to…", grounded *only* in provenance data | Modern discovery UX; must refuse to invent facts beyond the provenance graph. | Medium |
| 8 | **Data sonification** — map photometry/spectra/time-series to audio | Accessibility beyond WCAG visual; strong for blind/low-vision users and outreach. | Medium |
| 9 | **Multiplayer / live guided tours** — planetarium & classroom mode, shared camera | The guide's "education" mode needs a presenter/cohort capability. | Medium |
| 10 | **Mobile AR (WebXR AR)** — place the sky/objects in the room | Extends the "constrained tour" surface into genuinely engaging mobile use. | Medium |
| 11 | **Spectra / SED viewer + colour-true calibration** | Replace the prototype's heuristic colour map with calibrated SED→sRGB. | Medium |
| 12 | **ADS literature integration** — per-object papers, linked from the inspector | Deepens "data inspection" mode for researchers. | Medium |
| 13 | **Internationalisation (i18n/l10n)** | Global outreach mandate; retrofitting i18n late is expensive. | Medium |
| 14 | **Educational assessment / gamified learning paths** | Makes the education mode measurable and sticky. | Low |
| 15 | **Telemetry & observability** — usage analytics, render-error reporting, SLOs | Operate the platform; feed the benchmark suite with real device data. | Medium |

Recommended near-term additions to the current prototype: **L0 Solar System**,
**exoplanet overlay**, **time scrubber**, and the **citation ledger** — each is
small relative to its impact and reuses the existing provenance + delivery
machinery.

---

## 10. Definition of done (last step)

The platform is "done for launch" when: a user can move continuously from the
Solar System to the cosmic web; every object is inspectable with honest
provenance and uncertainty; all archive credits/rights are honoured and
auto-exportable; scenes are pinned to immutable, citeable releases; golden-scene
CI is green; security (OWASP API Top-10) and accessibility (WCAG 2.2 AA + XR
comfort + sonification) pass; and cost guardrails keep run-rate within the
chosen scenario band. Maintenance then runs the four durable practices (§4,
Phase 6) indefinitely.
