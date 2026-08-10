# Marvel Watch Order

The Marvel catalog in release, chronological and custom viewing orders — with a
prerequisite dependency graph for every title. Pick any film and see exactly
what you need to have watched first, and why.

## Run it

```
run.bat
```

That validates the catalog, starts both servers and opens the app. First run
installs frontend dependencies.

| | |
|---|---|
| App | http://localhost:5173 |
| API docs | http://localhost:8000/api/docs |

<details>
<summary>Manual setup</summary>

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e ".[dev]"
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to the API, so both environments are same-origin.
</details>

## How it works

**The dependency edges are the source of truth.** Release order is derived from
dates and chronological order is editorial, but "what must I watch first" is a
directed acyclic graph — and every interesting feature is a query over it.

- `backend/app/core/graph.py` is the engine: Kahn's topological sort with
  deterministic tie-breaking, cycle detection, transitive closure with
  longest-path depth, and order validation. It imports nothing from SQLAlchemy
  or FastAPI, which is why its tests run in milliseconds with no fixtures.
- `backend/app/seed/data/mcu.json` is the catalog: 54 titles and 80 hand-written
  edges, each with a note explaining the dependency. **Array position is the
  chronological order**; release order is derived from dates. Neither is
  hand-numbered, so neither can drift.
- The loader asserts the curated chronology is itself a valid topological sort
  of the edges. That one check catches most authoring mistakes.

### Why depth is computed on the server

Each node in a prerequisite chain carries a `depth` measured by **longest** path
to the target, not shortest. Longest path is what guarantees a title is drawn
further from the target than everything depending on it — with shortest path,
edges visually skip backwards over intervening columns. Because the server sends
it, the graph visualization is ~120 lines of SVG arithmetic with no graph
library.

### Two validators, one fixture

The order builder validates while you drag, which means a copy of the validator
runs in the browser (`frontend/src/lib/validateOrder.js`). Two implementations
of one rule is a real risk, so both are tested against the same
`fixtures/validation_cases.json` — including the exact wording of every message.
If they drift, CI fails.

## Layout

```
backend/          FastAPI + the graph engine
  app/core/       graph.py (pure), config, enums
  app/seed/       curated catalog, validation, Postgres loader
  app/api/        routes
  tests/          97 tests, no infrastructure required
frontend/         React + Vite + Tailwind v4
  src/lib/        dagLayout.js, validateOrder.js
  src/features/   catalog, prereq graph, order builder
fixtures/         shared across both test suites
server.py         production entrypoint: API + built SPA in one process
```

## Data

The catalog is authoritative for ids, phases, sagas, tiers, chronology and the
dependency edges — the things APIs get wrong. TMDb fills in only posters,
synopses, runtimes and its own id.

Edit the catalog with the local editor (`catalog.bat` at the repo root, or
`streamlit run scripts/catalog_editor.py` from `backend`). It organises and
edits `app/seed/data/mcu.json`, validates with the same checks as
`app.seed.loader --check` before writing, and has a TMDb picker that shows every
match so you choose the right one rather than trusting a blind first hit. Its
Dependencies tab edits the graph directly: pick a title and connect or
disconnect what it requires and what it unlocks, essential or recommended.

Needs `TMDB_API_KEY` in the root `.env` (see `.env.example`) for the picker. The
editor writes back into the JSON so the result is reviewable as a diff.

## Deploying

Configured for Vercel: `server.py` serves the API and the built SPA from one
origin, so there is no CORS and deep links resolve.

```bash
vercel deploy
```

`vercel.json` sets the build command; `requirements.txt` holds the runtime
dependencies, deliberately just FastAPI and pydantic — the API reads the catalog
from JSON and needs no database.

## Status

Working: catalog with release/chronological/filtered views, title detail, the
prerequisite graph, and the custom order builder with live validation.

Not built yet: **accounts**. Custom orders currently save to `localStorage`, so
they live in one browser. The Postgres schema, migration and seed loader for
users, saved orders and watch progress are already written and tested — they are
simply not wired up, because nothing so far needs a database.
