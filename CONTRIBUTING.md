# Contributing to the Universe Experience Platform

Thanks for your interest! This project is an **observation-first, provenance-aware**
scientific universe atlas. The guiding rule for every contribution:

> **Nothing is shown without declaring where it came from.** Every renderable
> entity must be *measured*, *derived*, *simulated*, or *procedurally* generated —
> and the UI must say which. If you add data, attach its provenance and credit.

## Getting set up

```bash
git clone <your-fork-url>
cd "Universe Experience Platform"
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/pipeline.py            # build the data lake (live archives + fallback)
python -m pytest -m "not network"     # run the test suite
python -m uvicorn backend.api.server:app --port 8000   # http://localhost:8000
```

## Ways to contribute

- **New layers / objects** — follow the pattern in `backend/uep/*.py` (a `build_payload`
  that emits a provenance-tagged JSON) plus a scene module in `web/`. Add a row to the
  layer registry in `web/app.js`.
- **New archive adapters** — subclass `ArchiveAdapter` in `backend/uep/archives/` and
  register it. Always set `credit` and `acknowledgement`.
- **Graphics / UX** — keep it scientifically honest; don't invent structure that isn't
  flagged procedural. Respect reduced-motion and keyboard accessibility.
- **Docs, tests, bug fixes** — always welcome.

## Standards

- Add or update **tests** in `tests/`. Network-dependent tests must be marked
  `@pytest.mark.network` so CI can skip them.
- High-value scientific values belong in `tests/test_golden.py` (golden scenes).
- Keep secrets out of the repo; never commit credentials.
- Run `python -m pytest -m "not network"` before opening a PR.

## Code of conduct

Be kind, be curious, assume good faith. We're here to help people experience the
universe accurately.
