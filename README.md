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

### The whole-catalog graph: forces on one axis, a constraint on the other

`/timeline` gives the page over to every title at once, as a graph you can push
around. It does **not** reuse `dagLayout.js`: that engine gives every long edge
its own reserved lane, which is right for forty nodes and catastrophic for a
hundred and twenty — the cross axis swells past 3000px and the drawing
overflows on both axes at once.

Nor is it a plain force layout, which would make a pretty cloud that says
nothing about watch order. `frontend/src/lib/forceGraph.js` splits the
difference: **forces along one axis, a hard constraint on the other.** Every
title is held within a fraction of a level of its own dependency depth — under
half, so consecutive bands cannot overlap — while repulsion and the link
springs arrange each band freely. It cannot be dragged out of its band, so no
edge ever points backwards however hard the graph is pushed about.

Which axis carries the depth is a setting rather than a taste, because the
answer comes from the catalog: with sixteen depths and a hundred and twenty
titles the graph is long and thin, so it is laid along the longer side of the
screen. `depthAxis: 'x'` reads left to right, `'y'` top to bottom.

Dropping a title leaves it where it was dropped and lets everything else
redistribute around it — the point of moving one is to rearrange the graph for
reading, not to flick it and watch it spring back. Double-click hands one back
to the simulation; **Reset** hands back all of them.

The module is pure and frame-independent, so the whole simulation runs headless
in a test and gets measured. That is how its constants were chosen: over the
real catalog it settles in 386 ticks with all 139 edges pointing downward, no
overlapping nodes and 144 edge crossings. `forceGraph.test.js` asserts the
first two forever.

Three other things do most of the work of keeping it readable. Positions are
seeded by a median sweep over each band before the forces ever run — a force
layout barely reorders a band, so it inherits however many crossings it starts
with, and seeding cut them by a quarter. The canvas renders through React
exactly once: the simulation writes `transform` and the line endpoints straight
to the DOM inside a `requestAnimationFrame` loop that stops as soon as the
graph stops moving. And until you touch it, the view refits itself every frame,
so the graph fills whatever space the window gives it and there is never
anything to scroll to.

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
  src/lib/        dagLayout.js, forceGraph.js, validateOrder.js
  src/features/   catalog, timeline, prereq graph, order builder
fixtures/         shared across both test suites
server.py         production entrypoint: API + built SPA in one process
```

## Data

The catalog is authoritative for ids, phases, sagas, tiers, chronology and the
dependency edges — the things APIs get wrong. TMDb fills in only posters,
synopses, runtimes and its own id.

Edit the catalog with the local editor: run `catalog.bat` at the repo root and
it opens at `localhost:5173/editor.html`. It organises and edits
`app/seed/data/mcu.json`, validates with the same checks as
`app.seed.loader --check` before writing, and has a TMDb picker that shows every
match so you choose the right one rather than trusting a blind first hit. Its
Dependencies tab edits the graph directly: pick a title and connect or
disconnect what it requires and what it unlocks, essential or recommended.

The editor is a second Vite entry point (`frontend/editor.html`) talking to a
small local FastAPI app (`backend/scripts/catalog_api.py`) on port 8010. Vite
builds `index.html` only and that API is separate from `app.main`, so neither
half of the tool exists in a production build.

Needs `TMDB_API_KEY` in the root `.env` (see `.env.example`) for the picker. The
editor writes back into the JSON so the result is reviewable as a diff.

## Deploying

Configured for Vercel: `server.py` serves the API and the built SPA from one
origin, so there is no CORS and deep links resolve.

```bash
vercel deploy
```

`vercel.json` sets the build command; `requirements.txt` holds the runtime
dependencies. The catalog half of the API still reads from JSON and touches no
database, but accounts need one, so the driver and auth libraries ship too.

Set three environment variables in the Vercel project:

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `prod` — drives both `cookie_secure` and the `NullPool` engine |
| `DATABASE_URL` | Neon's **pooled** host (the one containing `-pooler`) |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |

The app refuses to start in `prod` with the default `SECRET_KEY`, so a
misconfigured deploy fails loudly rather than shipping forgeable sessions.

## Accounts

Signed out, the app works exactly as it always did: everything saves to
`localStorage` and lives in one browser. Signing in swaps the storage backend
and offers to bring that data along — orders keep their existing ids, and
anything already in the account wins.

Sessions are an HttpOnly cookie carrying a JWT, same origin in both dev and
production, so no token is ever visible to JavaScript.

### Database setup

Run against the **direct** (non-pooled) host — PgBouncer's transaction mode
cannot hold a session open for DDL:

```bash
cd backend && alembic upgrade head && python -m app.seed.loader
```

The seed step is not optional. `custom_order_items.movie_id` and
`watch_progress.movie_id` are foreign keys into `movies`, so an unseeded
database cannot store an order at all — and **any change to
`app/seed/data/mcu.json` needs the loader re-run against every database before
the deploy that ships it.**

## Status

Working: catalog with release/chronological/filtered views, title detail, the
prerequisite graph, the whole-catalog force graph, the custom order builder
with live validation, and accounts syncing saved orders, watch progress and
display preferences across devices.
