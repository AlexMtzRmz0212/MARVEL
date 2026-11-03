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

### Two people, and no way to look either of them up

Comparing progress with somebody needs a way for one account to address another,
and both of the obvious ones are enumeration vectors: an endpoint that answers
"is there a user at this address" is an address oracle, and a public handle makes
every account guessable by hand. So there are two mechanisms and neither is a
directory.

A **share link** is a capability URL. A random token the owner mints and hands
out; whoever holds it sees a display name and a set of watched ids, no account
required. Revoking it stops every copy at once.

A **friend code** is the opposite shape: holding one grants nothing at all, not
even confirmation that the account exists. The most it buys is the right to send
a request, and nothing is disclosed until that request is accepted. Which is why
the code is issued to every account automatically while the share token is
opt-in, and why the code has no off switch — rotating it invalidates every copy
anybody holds, and that is the only control the threat model needs.

`friendships` stores each relationship **once**, with the pair canonically
ordered by uuid and a CHECK that says so. That one constraint makes the composite
primary key a real uniqueness guarantee — without it, two people pressing "add"
at the same moment end up with a request each that the other cannot see — and its
strict inequality rules out self-friendship for free. `requested_by_id` carries
the direction the ordering destroyed, which is the whole difference between
"accept or decline" and "waiting on them".

Both paths end at the same place: the compare page reduces a friend and a pasted
link to the same `{name, watchedIds}` and nothing below that knows which is
which. What it draws is a four-way split that generalises to any number of
people — everyone, nobody, you alone, and everything left over — where the
two-person wording falls out of the same branches. The many-person test exists
because it does not: the shorter ternary that passes every two-person case files
a title you and one of three friends have seen under "only you".

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
  tests/          185 tests, no infrastructure required
frontend/         React + Vite + Tailwind v4
  src/lib/        dagLayout.js, forceGraph.js, validateOrder.js
  src/features/   catalog, timeline, prereq graph, order builder, friends,
                  admin (the catalog editor, behind a password)
fixtures/         shared across both test suites
server.py         production entrypoint: API + built SPA in one process
```

## Data

The catalog is authoritative for ids, phases, sagas, tiers, chronology and the
dependency edges — the things APIs get wrong. TMDb fills in only posters,
synopses, runtimes and its own id.

It also records what is left after the picture ends. A film carries a count; a
season carries the episodes that hold something back, and its total is summed
from them rather than written down a second time to drift. An absent field means
nobody has checked, which is not the claim a recorded `0` makes — so the catalog
grid marks only a positive count, and the title page is the only place that ever
says there is nothing to wait for.

## The catalog editor

The catalog is edited in the app, at `/admin`. The footer links there for
everyone; the page asks for a password that only the owner knows, and the server
refuses every editor request without it. It is the private half of the site:

- **Sign-in** is one shared password, not an account. The server stores only an
  argon2 hash of it (`ADMIN_PASSWORD_HASH`) and, on success, sets a second
  HttpOnly cookie that is separate from the user session, expires after 12 hours
  and is only ever sent to `/api/admin`. A user token cannot pass as an admin one
  or the other way round. Five wrong guesses lock that client out for 15 minutes,
  counted in the database because the app runs as serverless functions.
- **It fails closed.** With no hash set, every `/api/admin` route is a 404 — except
  when `ENVIRONMENT=dev`, where the editor is simply open so that `catalog.bat`
  needs no password.
- **Edits are live.** The live catalog is one row in Neon (`catalog_document`), in
  the shape of `mcu.json`. Saving validates it with everything the app checks at
  startup, plus the recommended orders, then stores it and reconciles `movies`
  and `prerequisites` in the same transaction, so a new title can be saved to an
  order straight away. There is no redeploy and no loader step.
- **Undo.** Each save keeps the version it replaced (the last 30), and the editor
  can restore one. A restore is a save like any other. **Export mcu.json** downloads
  the live catalog byte for byte, to commit as a backup.
- **`mcu.json` is the first copy and the fallback.** The first time the editor is
  opened it imports the bundled file. Until then — and if the database cannot be
  reached or the stored catalog fails validation — the public site serves the
  bundled file instead of an error. Each server process re-checks the stored
  revision at most every 30 seconds, so a page view costs no query, and another
  instance can show an edit up to that long late.
- **Episodes** come from two places. `episodes.json` is the generated file
  (`scripts/fetch_episodes.py`) that ships with a deploy; a series' dialog in the
  editor also has **Fetch from TMDb**, which stores that show's episodes in the
  document's own `episodes` key, overriding the file's list for that title. So a
  series added in the editor gets its checklist as soon as TMDb lists the
  episodes, with no deploy. Both are validated together on every save.
- `recommended_orders.json` is still a file, curated outside the editor and
  changed with a deploy. The editor refuses a save that would orphan it.
- Deleting a title deletes saved-order and watch-progress rows that point at it,
  for every user (they are `ON DELETE CASCADE`), so the editor says how many first.

Run it locally with `catalog.bat`, which starts the API and Vite and opens
`localhost:5173/admin`. Local edits go to whichever database `backend/.env`
names; the header shows which. The editor has a TMDb picker that shows every
match so you choose the right one rather than trusting a blind first hit, and its
Dependencies tab edits the graph directly: pick a title and connect or disconnect
what it requires and what it unlocks, essential or recommended.

To set the password:

```bash
cd backend
.venv/Scripts/python.exe scripts/hash_admin_password.py
```

and put the printed `ADMIN_PASSWORD_HASH` in the Vercel project (and in
`backend/.env` to try the real sign-in locally). `TMDB_API_KEY` is needed too, in
the root `.env` or Vercel, for the picker.

## Deploying

Configured for Vercel: `server.py` serves the API and the built SPA from one
origin, so there is no CORS and deep links resolve.

```bash
vercel deploy
```

`vercel.json` sets the build command; `requirements.txt` holds the runtime
dependencies. The database now holds the live catalog as well as accounts, so
the driver, the auth libraries and `requests` (for the editor's TMDb picker)
all ship.

Set these environment variables in the Vercel project:

| Variable | Value |
| --- | --- |
| `ENVIRONMENT` | `prod` — drives both `cookie_secure` and the `NullPool` engine |
| `DATABASE_URL` | Neon's **pooled** host (the one containing `-pooler`) |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ADMIN_PASSWORD_HASH` | from `backend/scripts/hash_admin_password.py` — without it the editor does not exist |
| `TMDB_API_KEY` | for the editor's poster picker |

The app refuses to start in `prod` with the default `SECRET_KEY`, so a
misconfigured deploy fails loudly rather than shipping forgeable sessions.

## Accounts

Signed out, the app works exactly as it always did: everything saves to
`localStorage` and lives in one browser. Signing in swaps the storage backend
and offers to bring that data along — orders keep their existing ids, and
anything already in the account wins.

Sessions are an HttpOnly cookie carrying a JWT, same origin in both dev and
production, so no token is ever visible to JavaScript.

Friends are the one feature with no signed-out half, because a friendship is
between two accounts and a browser holding `localStorage` is not one of them. The
nav item is hidden rather than shown as a locked door, and comparing against a
share link still works with no account at either end.

### Database setup

Run against the **direct** (non-pooled) host — PgBouncer's transaction mode
cannot hold a session open for DDL:

```bash
cd backend && alembic upgrade head && python -m app.seed.loader
```

The seed step is not optional the first time. `custom_order_items.movie_id` and
`watch_progress.movie_id` are foreign keys into `movies`, so an unseeded
database cannot store an order at all.

After that the editor keeps `movies` in step by itself: every save reconciles it
in the same transaction. The loader is only needed again if you change
`app/seed/data/mcu.json` by hand — and note that the database, not that file, is
what the site serves once the editor has been opened, so a hand edit to the file
does not reach the site until it is imported (delete the `catalog_document` row,
or paste the file's contents over it by saving through the editor).

The first release of the editor needs `alembic upgrade head` (migration `0011`
adds `catalog_document`, `catalog_history` and `admin_attempts`) run against the
direct host before the deploy. Nothing needs seeding for it: until the editor is
first opened the site keeps serving the bundled `mcu.json`.

## Status

Working: catalog with release/chronological/filtered views, title detail with
its credits-scene breakdown, the prerequisite graph, the whole-catalog force
graph, the custom order builder with live validation, and accounts syncing
saved orders, watch progress and display preferences across devices.
