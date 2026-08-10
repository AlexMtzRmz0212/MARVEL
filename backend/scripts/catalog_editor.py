"""A local, visual editor for the curated catalog.

Run it with `catalog.bat` (repo root) or:

    cd backend
    .venv\\Scripts\\streamlit.exe run scripts\\catalog_editor.py

The catalog is a wall of movies, so the editor looks like one: a grid of
posters you click to edit in a pop-up, drag to reorder, and that saves itself.

* Click a poster to edit it in a focused dialog -- no long scrolling form.
* The dialog's TMDb picker shows *every* match (poster, year, overview) and you
  choose, so "X-Men: First Class" can't silently match a making-of special.
* The Dependencies tab edits the graph itself: pick a title and connect or
  disconnect what it requires *and* what it unlocks, with essential/recommended
  and the note editable in place.
* Every change is validated with the same checks as `app.seed.loader --check`
  and, if valid, written straight back to mcu.json. Nothing invalid is ever
  saved, so a bad edit can't become a 500 on the deployed site.
"""

from __future__ import annotations

import copy
import json
import os
import shutil
import sys
from datetime import date
from pathlib import Path

import requests
import streamlit as st
from dotenv import load_dotenv

# --- import path -----------------------------------------------------------
# streamlit runs this file directly, so make both the backend package root
# (for `app.*`) and this scripts directory (for `enrich_tmdb`) importable.
SCRIPTS_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPTS_DIR.parent
REPO_ROOT = BACKEND_DIR.parent
for path in (str(BACKEND_DIR), str(SCRIPTS_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

import enrich_tmdb  # noqa: E402  (path set above)

from app.core.enums import MediaType, Saga, Strength, Tier, Universe  # noqa: E402
from app.seed.schema import SeedFile, SeedValidationError, validate_catalog  # noqa: E402

try:
    from streamlit_sortables import sort_items  # noqa: E402
except ImportError:  # pragma: no cover - optional convenience
    sort_items = None

SEED_PATH = enrich_tmdb.SEED_PATH
POSTER_BASE = enrich_tmdb.POSTER_BASE

SAGAS = [member.value for member in Saga]
UNIVERSES = [member.value for member in Universe]
MEDIA_TYPES = [member.value for member in MediaType]
TIERS = [member.value for member in Tier]
STRENGTHS = [member.value for member in Strength]

GALLERY_COLUMNS = 5


# --------------------------------------------------------------------------- #
# Catalog state
# --------------------------------------------------------------------------- #
def load_document() -> dict:
    """Read mcu.json verbatim, preserving `$comment` and `version`.

    The exact text is remembered so `autosave` can tell whether the file has
    since been changed by someone else -- two editor windows open on the same
    file is an easy mistake, and last-writer-wins silently resurrects whatever
    the stale window loaded.
    """
    text = SEED_PATH.read_text(encoding="utf-8")
    st.session_state.disk_text = text
    return json.loads(text)


def ensure_state() -> None:
    st.session_state.setdefault("document", load_document())
    st.session_state.setdefault("candidates", [])
    st.session_state.setdefault("draft_for", None)
    st.session_state.setdefault("search", "")
    st.session_state.setdefault("universe_filter", [])
    st.session_state.setdefault("link_error", None)


def movies() -> list[dict]:
    return st.session_state.document["movies"]


def find_index(movie_id: str) -> int | None:
    for index, movie in enumerate(movies()):
        if movie["id"] == movie_id:
            return index
    return None


def movie_by_id(movie_id: str) -> dict | None:
    index = find_index(movie_id)
    return None if index is None else movies()[index]


def dependents_of(movie_id: str) -> list[tuple[dict, dict]]:
    """Every (title, edge) pair whose edge points at `movie_id`.

    An edge is stored on the title that *depends*, so the titles a given one
    unlocks can only be found by sweeping the whole catalog.
    """
    return [
        (movie, edge)
        for movie in movies()
        for edge in movie.get("prerequisites", [])
        if edge["id"] == movie_id
    ]


def parse_date(value) -> date:
    """Best-effort parse of a stored release_date into a date for the picker.

    A bare year like "2011" -- the value the old insert flow wrote -- is not a
    valid date, so fall back to Jan 1 of that year and let the user fix it.
    """
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            digits = value.strip()[:4]
            if digits.isdigit():
                return date(int(digits), 1, 1)
    return date(2008, 1, 1)


def year_of(movie: dict) -> str:
    value = movie.get("release_date") or ""
    return value[:4] if isinstance(value, str) and value[:4].isdigit() else "—"


def label_of(movie: dict) -> str:
    return f"{movie['title']} ({year_of(movie)})"


# --------------------------------------------------------------------------- #
# Validation & saving
# --------------------------------------------------------------------------- #
def validate_document(document: dict):
    """Run the loader's own validation. Returns (catalog, problems)."""
    try:
        seed = SeedFile.model_validate(document)
    except Exception as exc:  # pydantic ValidationError -> readable lines
        problems = []
        errors = getattr(exc, "errors", None)
        if callable(errors):
            for error in exc.errors():
                location = ".".join(str(part) for part in error["loc"])
                problems.append(f"{location}: {error['msg']}")
        else:
            problems.append(str(exc))
        return None, problems

    try:
        catalog = validate_catalog(seed)
    except SeedValidationError as exc:
        return None, list(exc.problems)
    return catalog, []


def disk_conflict() -> str | None:
    """Describe how mcu.json differs from what this window last read or wrote.

    Two editor windows on one file is the failure that costs an afternoon: the
    stale one writes its whole document back and silently reinstates every
    edge the other had removed. Cheap to detect, so never write blind.
    """
    known = st.session_state.get("disk_text")
    if known is None or not SEED_PATH.exists():
        return None
    if SEED_PATH.read_text(encoding="utf-8") == known:
        return None
    return (
        "mcu.json changed on disk since this window loaded it — another editor "
        "window, most likely. Nothing was written, because saving would undo "
        "whatever that window did. Use ↻ Reload from disk to pick up its "
        "version (this window's unsaved changes are lost)."
    )


def autosave(revert_to: dict | None = None) -> bool:
    """Validate the working document and, if valid, write it back to disk.

    Called after every deliberate change (a dialog save, a delete, a drag), so
    there is no separate 'save' step -- but an invalid document (a cycle, a bad
    date) is never written, only surfaced.

    Pass `revert_to` for changes the user cannot easily undo by hand -- a single
    edge toggle leaves no form open to correct, so the rejected change is rolled
    back instead of leaving the working copy broken. Returns whether it saved.
    """
    catalog, problems = validate_document(st.session_state.document)
    if problems:
        if revert_to is not None:
            st.session_state.document = revert_to
        st.session_state.save_error = problems
        st.toast("Not saved — validation failed. See the sidebar.", icon="⚠️")
        return False

    if conflict := disk_conflict():
        if revert_to is not None:
            st.session_state.document = revert_to
        st.session_state.save_error = [conflict]
        st.toast("Not saved — the file changed on disk. See the catalog status.", icon="⚠️")
        return False

    if SEED_PATH.exists():
        shutil.copy2(SEED_PATH, SEED_PATH.with_name(f"{SEED_PATH.name}.bak"))
    text = json.dumps(st.session_state.document, indent=2, ensure_ascii=False) + "\n"
    # newline="\n": without it Windows writes CRLF and every save shows up as a
    # whole-file change in git, burying the one edge that actually moved.
    SEED_PATH.write_text(text, encoding="utf-8", newline="\n")
    st.session_state.disk_text = text
    st.session_state.save_error = None
    st.session_state.warnings = list(catalog.warnings)
    st.toast("Saved to mcu.json", icon="💾")
    return True


# --------------------------------------------------------------------------- #
# TMDb picker
# --------------------------------------------------------------------------- #
def api_key() -> str | None:
    load_dotenv(REPO_ROOT / ".env")
    return os.environ.get("TMDB_API_KEY")


def run_tmdb_search(title: str, media_type: str) -> list[dict]:
    key = api_key()
    if not key:
        st.error("TMDB_API_KEY is not set. Copy .env.example to .env at the repo root.")
        return []
    session = requests.Session()
    seen: set[tuple[int, str]] = set()
    results: list[dict] = []
    try:
        for candidate_title in enrich_tmdb.title_candidates(title):
            for kind in enrich_tmdb.search_endpoints(media_type):
                # No year filter: the human disambiguates by the year shown on
                # each candidate, which is more reliable than a filter that can
                # hide the real title.
                for candidate in enrich_tmdb.search_candidates(
                    session, key, kind, candidate_title, None
                ):
                    marker = (candidate["id"], candidate["kind"])
                    if marker not in seen:
                        seen.add(marker)
                        results.append(candidate)
    except (enrich_tmdb.TmdbError, requests.RequestException) as exc:
        st.error(f"TMDb request failed: {exc}")
        return []
    return results


def apply_tmdb_choice(candidate: dict) -> None:
    """Fetch the chosen title's metadata and stage it into the draft."""
    key = api_key()
    session = requests.Session()
    try:
        details = enrich_tmdb.fetch_details(
            session, key, candidate["kind"], candidate["id"], None,
            st.session_state.draft_media_type,
        )
    except (enrich_tmdb.TmdbError, requests.RequestException) as exc:
        st.error(f"Could not fetch details: {exc}")
        return

    if details.get("tmdb_id") is not None:
        st.session_state.draft_tmdb_id = int(details["tmdb_id"])
    if details.get("poster_url"):
        st.session_state.draft_poster_url = details["poster_url"]
    if details.get("synopsis"):
        st.session_state.draft_synopsis = details["synopsis"]
    # These two are editable widgets rendered *after* the picker, so setting
    # their state here lands in the widgets on this same run.
    if details.get("runtime_min"):
        st.session_state.draft_runtime = int(details["runtime_min"])
    if details.get("release_date"):
        st.session_state.draft_release = parse_date(details["release_date"])
    st.session_state.candidates = []
    st.session_state.tmdb_applied = candidate


# --------------------------------------------------------------------------- #
# Edit dialog
# --------------------------------------------------------------------------- #
def seed_draft(source: dict | None) -> None:
    s = source or {}
    ss = st.session_state
    ss.draft_id = s.get("id", "")
    ss.draft_title = s.get("title", "")
    ss.draft_release = parse_date(s["release_date"]) if s.get("release_date") else date(2008, 1, 1)
    ss.draft_has_phase = bool(s.get("phase"))
    ss.draft_phase = int(s["phase"]) if s.get("phase") else 1
    ss.draft_saga = s.get("saga", "N/A")
    ss.draft_universe = s.get("universe", "Earth-616")
    ss.draft_media_type = s.get("media_type", "film")
    ss.draft_tier = s.get("tier", "core")
    ss.draft_runtime = int(s["runtime_min"]) if s.get("runtime_min") else 0
    ss.draft_tmdb_id = int(s["tmdb_id"]) if s.get("tmdb_id") else 0
    ss.draft_poster_url = s.get("poster_url") or ""
    ss.draft_synopsis = s.get("synopsis") or ""
    ss.draft_prereqs = [dict(p) for p in s.get("prerequisites", [])]
    ss.draft_insert_before = None  # None = at the beginning; else insert before this id
    ss.tmdb_applied = None


@st.dialog("Edit title", width="large")
def edit_dialog(movie_id: str | None) -> None:
    # Seed once per opened title. Streamlit replays this body on the reruns that
    # the picker's buttons cause; the guard keeps those replays from wiping edits.
    key = movie_id or "__new__"
    if st.session_state.draft_for != key:
        source = None if movie_id is None else movies()[find_index(movie_id)]
        seed_draft(source)
        st.session_state.candidates = []
        st.session_state.draft_for = key

    top_left, top_right = st.columns(2)
    with top_left:
        st.text_input("id (kebab-case)", key="draft_id", disabled=movie_id is not None)
        st.text_input("Title", key="draft_title")
        st.selectbox("Media type", MEDIA_TYPES, key="draft_media_type")
    with top_right:
        st.selectbox("Saga", SAGAS, key="draft_saga")
        st.selectbox("Universe", UNIVERSES, key="draft_universe")
        st.selectbox("Tier", TIERS, key="draft_tier")

    # --- where in the array a new title lands (existing titles use reorder) -
    if movie_id is None:
        def _insert_option_label(option_id: str | None) -> str:
            if option_id is None:
                return "— At the beginning —"
            index = find_index(option_id)
            return f"Before {index + 1}. {movies()[index]['title']}"

        st.selectbox(
            "Insert position",
            [None] + [m["id"] for m in movies()],
            format_func=_insert_option_label,
            key="draft_insert_before",
            help="Array order is the chronological timeline order. You can also "
            "drag it into place afterwards from the reorder panel.",
        )

    # --- TMDb picker: rendered before date/runtime so a pick flows into them --
    st.divider()
    pick_col, btn_col = st.columns([4, 1])
    with pick_col:
        st.caption("Search TMDb by the title above, then pick the right match.")
    with btn_col:
        if st.button("🔍 Search", width="stretch"):
            st.session_state.candidates = run_tmdb_search(
                st.session_state.draft_title, st.session_state.draft_media_type
            )
            if not st.session_state.candidates:
                st.info("No matches. Adjust the title and try again.")

    if st.session_state.get("tmdb_applied"):
        a = st.session_state.tmdb_applied
        st.success(f"Using: {a['title']} ({a.get('year') or '—'}) · tmdb {a['id']}")

    for candidate in st.session_state.candidates:
        img_col, info_col, use_col = st.columns([1, 4, 1])
        with img_col:
            if candidate.get("poster_path"):
                st.image(f"{POSTER_BASE}{candidate['poster_path']}", width=70)
        with info_col:
            year = candidate.get("year") or "—"
            st.write(f"**{candidate['title']}** ({year}) · {candidate['kind']}")
            overview = candidate.get("overview") or ""
            st.caption(overview[:200] + ("…" if len(overview) > 200 else ""))
        with use_col:
            if st.button("Use", key=f"use_{candidate['kind']}_{candidate['id']}", width="stretch"):
                # No st.rerun(): that would dismiss the dialog. The button press
                # already triggers a rerun, and the preview/date/runtime widgets
                # below re-read the values this call stages into session_state.
                apply_tmdb_choice(candidate)
    st.divider()

    # --- fields that the picker fills (rendered after it) -----------------
    date_col, phase_col, runtime_col = st.columns(3)
    with date_col:
        st.date_input("Release date", key="draft_release")
    with phase_col:
        has_phase = st.checkbox("Has a phase", key="draft_has_phase")
        st.number_input("Phase", 1, 10, step=1, key="draft_phase", disabled=not has_phase)
    with runtime_col:
        st.number_input("Runtime (min, 0 = none)", 0, step=1, key="draft_runtime")

    # --- metadata preview (filled by the picker) --------------------------
    if st.session_state.draft_poster_url or st.session_state.draft_synopsis:
        prev_img, prev_txt = st.columns([1, 4])
        with prev_img:
            if st.session_state.draft_poster_url:
                st.image(st.session_state.draft_poster_url, width=110)
        with prev_txt:
            if st.session_state.draft_tmdb_id:
                st.caption(f"TMDb id {st.session_state.draft_tmdb_id}")
            if st.session_state.draft_synopsis:
                st.caption(st.session_state.draft_synopsis)

    # --- prerequisites ----------------------------------------------------
    st.markdown("**Prerequisites**")
    others = [m["id"] for m in movies() if m["id"] != movie_id]
    current = [p["id"] for p in st.session_state.draft_prereqs if p["id"] in others]
    selected = st.multiselect("Depends on", others, default=current, key="draft_prereq_ids")
    existing = {p["id"]: p for p in st.session_state.draft_prereqs}
    built: list[dict] = []
    for prereq_id in selected:
        row = existing.get(prereq_id, {"id": prereq_id, "strength": "essential", "note": ""})
        s_col, n_col = st.columns([1, 3])
        with s_col:
            strength = st.selectbox(
                f"{prereq_id}", STRENGTHS,
                index=STRENGTHS.index(row.get("strength", "essential")),
                key=f"strength_{prereq_id}", label_visibility="collapsed",
            )
        with n_col:
            note = st.text_input(
                f"note for {prereq_id}", value=row.get("note") or "",
                key=f"note_{prereq_id}", label_visibility="collapsed",
                placeholder=f"why {prereq_id} first (optional)",
            )
        built.append({"id": prereq_id, "strength": strength, "note": note or None})
    st.session_state.draft_prereqs = built

    # --- actions ----------------------------------------------------------
    st.divider()
    save_col, del_col, cancel_col = st.columns([1, 1, 1])
    with save_col:
        if st.button("✓ Save", type="primary", width="stretch"):
            commit_entry(movie_id)
    if movie_id is not None:
        with del_col:
            if st.button("🗑 Delete", width="stretch"):
                delete_entry(movie_id)
    with cancel_col:
        if st.button("Cancel", width="stretch"):
            st.session_state.draft_for = None
            st.rerun()


def build_entry() -> dict:
    return {
        "id": st.session_state.draft_id.strip(),
        "title": st.session_state.draft_title.strip(),
        "release_date": st.session_state.draft_release.isoformat(),
        "phase": int(st.session_state.draft_phase) if st.session_state.draft_has_phase else None,
        "saga": st.session_state.draft_saga,
        "universe": st.session_state.draft_universe,
        "media_type": st.session_state.draft_media_type,
        "tier": st.session_state.draft_tier,
        "runtime_min": int(st.session_state.draft_runtime) or None,
        "prerequisites": st.session_state.draft_prereqs,
        "tmdb_id": int(st.session_state.draft_tmdb_id) or None,
        "poster_url": st.session_state.draft_poster_url.strip(),
        "synopsis": st.session_state.draft_synopsis.strip(),
    }


def commit_entry(movie_id: str | None) -> None:
    entry = build_entry()
    if not entry["id"]:
        st.error("An id is required.")
        return

    if movie_id is None:
        if find_index(entry["id"]) is not None:
            st.error(f"id '{entry['id']}' already exists.")
            return
        insert_before_id = st.session_state.get("draft_insert_before")
        index = find_index(insert_before_id) if insert_before_id is not None else 0
        movies().insert(index, entry)
    else:
        movies()[find_index(movie_id)] = entry

    st.session_state.draft_for = None
    autosave()
    st.rerun()


def delete_entry(movie_id: str) -> None:
    index = find_index(movie_id)
    if index is not None:
        movies().pop(index)
    for movie in movies():
        movie["prerequisites"] = [p for p in movie.get("prerequisites", []) if p["id"] != movie_id]
    st.session_state.draft_for = None
    autosave()
    st.rerun()


# --------------------------------------------------------------------------- #
# Gallery + reorder
# --------------------------------------------------------------------------- #
def visible_movies() -> list[dict]:
    query = st.session_state.search.strip().lower()
    universes = st.session_state.universe_filter
    result = []
    for movie in movies():
        if query and query not in movie["title"].lower() and query not in movie["id"]:
            continue
        if universes and movie["universe"] not in universes:
            continue
        result.append(movie)
    return result


def render_toolbar() -> None:
    search_col, filter_col, add_col = st.columns([3, 2, 1])
    with search_col:
        st.text_input(
            "Search", key="search", placeholder="Search titles…",
            label_visibility="collapsed",
        )
    with filter_col:
        st.multiselect(
            "Universe", UNIVERSES, key="universe_filter",
            placeholder="All universes", label_visibility="collapsed",
        )
    with add_col:
        if st.button("➕ Add title", width="stretch"):
            edit_dialog(None)


def render_status_menu() -> None:
    """The catalog status + reload control that used to live in the sidebar,
    now tucked behind a button in the right rail (the sidebar itself now
    hosts the reorder panel). The button's own label carries the at-a-glance
    validity status, so you don't have to open it just to see if it's OK."""
    catalog, problems = validate_document(st.session_state.document)
    # A refused save (a conflict on disk) leaves a valid document in memory, so
    # the label has to carry it too or the only trace is a toast that has gone.
    unsaved = st.session_state.get("save_error") or []
    if problems:
        label = f"⚠️ {len(problems)} problem(s)"
    elif unsaved:
        label = "⚠️ Not saved"
    else:
        label = "✅ Valid"
    st.caption("Catalog")
    popover = st.popover(label, width="stretch", on_change="rerun")
    if not popover.open:
        return
    with popover:
        st.caption(str(SEED_PATH))
        if unsaved and not problems:
            for problem in unsaved:
                st.error(problem)
        if problems:
            st.error(f"{len(problems)} problem(s) — not saving until fixed")
            for problem in problems:
                st.write(f"- {problem}")
        else:
            st.success(f"Valid · {len(movies())} titles · {len(catalog.edges)} edges")
            warnings = st.session_state.get("warnings") or catalog.warnings
            if warnings:
                with st.expander(f"{len(warnings)} warning(s)"):
                    for warning in warnings:
                        st.write(f"- {warning}")
        st.caption("Changes auto-save to mcu.json when valid.")
        st.divider()
        if st.button("↻ Reload from disk", width="stretch"):
            st.session_state.document = load_document()
            st.session_state.draft_for = None
            st.session_state.link_error = None
            st.session_state.save_error = None
            # Keyed edge widgets would otherwise keep showing values from the
            # document just discarded.
            for key in [k for k in st.session_state if k.startswith("dep_")]:
                del st.session_state[key]
            st.rerun()


def render_gallery() -> None:
    shown = visible_movies()
    st.caption(f"{len(shown)} of {len(movies())} titles")
    for start in range(0, len(shown), GALLERY_COLUMNS):
        row = shown[start : start + GALLERY_COLUMNS]
        for column, movie in zip(st.columns(GALLERY_COLUMNS), row, strict=False):
            with column:
                render_card(movie)


def render_card(movie: dict) -> None:
    poster = movie.get("poster_url")
    if poster:
        st.image(poster, width="stretch")
    else:
        st.markdown(
            f"<div style='aspect-ratio:2/3;display:flex;align-items:center;"
            f"justify-content:center;background:#222;border-radius:8px;"
            f"padding:8px;text-align:center;font-size:0.8rem;color:#bbb'>"
            f"{movie['title']}</div>",
            unsafe_allow_html=True,
        )
    badges = [f"P{movie['phase']}" if movie.get("phase") else None, movie["tier"]]
    if movie["universe"] != "Earth-616":
        badges.append(movie["universe"])
    badge_text = " · ".join(b for b in badges if b)
    st.markdown(f"**{movie['title']}**  \n{year_of(movie)} · {badge_text}")
    if st.button("✏️ Edit", key=f"edit_{movie['id']}", width="stretch"):
        edit_dialog(movie["id"])


REORDER_STYLE = """
.sortable-container-body { display: flex; flex-wrap: wrap; gap: 6px; counter-reset: order; }
.sortable-item, .sortable-item:hover {
    height: auto !important;
    width: 190px;
    white-space: normal;
    font-size: 0.8rem;
    line-height: 1.3;
    /* Calmer than the theme's default --primary-color red, which at 59
       solid tiles reads as an alert, not a movie grid. */
    background-color: #3a3d4a;
    color: var(--text-color);
    border: 1px solid #4b4f5e;
    position: relative;
    padding-left: 24px !important;
}
/* Drag order isn't obvious from a left-to-right, wrapping grid alone, so
   number each tile in DOM order -- it re-numbers live as you drag. */
.sortable-item::before {
    counter-increment: order;
    content: counter(order);
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.65rem;
    opacity: 0.6;
}
"""


def render_reorder(container) -> None:
    # No inner expander: the sidebar itself is already the show/hide toggle
    # (its native collapse arrow), so a second toggle around this content
    # would just be redundant.
    with container:
        if sort_items is None:
            st.info("Install `streamlit-sortables` to drag-reorder.")
            return
        st.caption("Array order is the chronological order. Drag a title, then it saves.")
        labels = [movie["title"] for movie in movies()]
        new_order = sort_items(
            labels, direction="vertical", key="reorder", custom_style=REORDER_STYLE
        )
        if new_order and new_order != labels:
            # Titles aren't guaranteed unique, so consume matches in order
            # (a queue per title) rather than a title -> movie dict.
            by_title: dict[str, list[dict]] = {}
            for movie in movies():
                by_title.setdefault(movie["title"], []).append(movie)
            st.session_state.document["movies"] = [by_title[title].pop(0) for title in new_order]
            autosave()
            st.rerun()


# --------------------------------------------------------------------------- #
# Dependencies editor
# --------------------------------------------------------------------------- #
def apply_edge_change(mutate) -> bool:
    """Run `mutate` on the working document, save it, and roll back if invalid.

    A single edge toggle leaves no form open to correct, so unlike a dialog save
    a rejected change is undone rather than left sitting in the working copy.

    Never calls `st.rerun()`: that is illegal inside a widget callback, and a
    callback is followed by a rerun anyway. Button handlers rerun themselves.
    """
    snapshot = copy.deepcopy(st.session_state.document)
    mutate()
    if autosave(revert_to=snapshot):
        st.session_state.link_error = None
        return True
    # After the rollback the document is valid again, so the catalog-status
    # popover must not keep claiming otherwise. The rejection belongs to the
    # edge that caused it and is shown beside it instead.
    st.session_state.link_error = st.session_state.save_error
    st.session_state.save_error = None
    return False


def connect(owner_id: str, prerequisite_id: str, strength: str, note: str) -> None:
    """Make `owner_id` depend on `prerequisite_id`."""
    def mutate() -> None:
        owner = movie_by_id(owner_id)
        owner.setdefault("prerequisites", []).append(
            {"id": prerequisite_id, "strength": strength, "note": note.strip() or None}
        )

    apply_edge_change(mutate)


def disconnect(owner_id: str, prerequisite_id: str) -> None:
    def mutate() -> None:
        owner = movie_by_id(owner_id)
        owner["prerequisites"] = [
            edge for edge in owner.get("prerequisites", []) if edge["id"] != prerequisite_id
        ]

    apply_edge_change(mutate)


def set_edge_field(owner_id: str, prerequisite_id: str, field: str, widget_key: str) -> None:
    """on_change handler: copy a widget's value onto its edge and save."""
    value = st.session_state[widget_key]
    if field == "note":
        value = value.strip() or None

    def mutate() -> None:
        for edge in movie_by_id(owner_id).get("prerequisites", []):
            if edge["id"] == prerequisite_id:
                edge[field] = value

    apply_edge_change(mutate)


def render_edge_row(owner: dict, edge: dict, other: dict) -> None:
    """One connection, from the point of view of whichever title is in focus.

    `owner` always holds the edge, `other` is the title at its far end -- so the
    same row renders both directions and every control edits `owner`.
    """
    prefix = f"{owner['id']}__{edge['id']}"
    with st.container(border=True):
        title_col, cut_col = st.columns([5, 1])
        with title_col:
            st.markdown(f"**{other['title']}**  \n{year_of(other)} · `{other['id']}`")
        with cut_col:
            # on_click, not `if st.button(...)`: a callback runs before the
            # script body, so the row simply isn't drawn on this run and no
            # st.rerun() is needed to hide it.
            st.button(
                "✕", key=f"dep_cut_{prefix}", help="Disconnect", width="stretch",
                on_click=disconnect, args=(owner["id"], edge["id"]),
            )
        strength_key = f"dep_str_{prefix}"
        st.radio(
            "Strength", STRENGTHS,
            index=STRENGTHS.index(edge.get("strength", "essential")),
            key=strength_key, horizontal=True, label_visibility="collapsed",
            on_change=set_edge_field,
            args=(owner["id"], edge["id"], "strength", strength_key),
        )
        note_key = f"dep_note_{prefix}"
        st.text_input(
            "Note", value=edge.get("note") or "", key=note_key,
            label_visibility="collapsed", placeholder="why, in one line (optional)",
            on_change=set_edge_field, args=(owner["id"], edge["id"], "note", note_key),
        )


def render_connect_form(
    side: str, focus: dict, eligible: list[str], label: str, empty_hint: str
) -> None:
    """The 'add a connection' affordance at the foot of a column.

    Deliberately *not* another bordered card: given the same shape as the edge
    rows above it, an empty picker + strength + note reads as a connection that
    already exists. A collapsed expander is unmistakably a thing you open to
    add something, and its fields carry visible labels for the same reason.
    """
    if not eligible:
        st.caption(empty_hint)
        return
    pick_key = f"dep_pick_{side}"
    # Deliberately not an st.form: a form submits on Enter, so picking a title
    # with the keyboard writes an edge with whatever strength and note happened
    # to be there -- a connection nobody asked for, made by a keystroke.
    #
    # The eligible set also changes with the focused title, and a keyed
    # selectbox holding a value that is no longer an option raises.
    if st.session_state.get(pick_key) not in eligible:
        st.session_state.pop(pick_key, None)
    with st.expander(label):
        st.selectbox(
            "Title", eligible, format_func=lambda i: label_of(movie_by_id(i)), key=pick_key,
        )
        st.radio("Strength", STRENGTHS, key=f"dep_new_str_{side}", horizontal=True)
        st.text_input(
            "Note", key=f"dep_new_note_{side}",
            placeholder="why, in one line (optional)",
        )
        st.button(
            "🔗 Connect", key=f"dep_connect_{side}", type="primary", width="stretch",
            on_click=submit_connection, args=(side, focus["id"]),
        )


def submit_connection(side: str, focus_id: str) -> None:
    """on_click handler for the Connect button. Only a click reaches here."""
    choice = st.session_state[f"dep_pick_{side}"]
    strength = st.session_state[f"dep_new_str_{side}"]
    note = st.session_state[f"dep_new_note_{side}"]
    if side == "requires":
        connect(focus_id, choice, strength, note)
    else:
        connect(choice, focus_id, strength, note)
    # Leave the panel ready for the next connection rather than holding the
    # one just made (which is no longer even an eligible option).
    for key in (f"dep_pick_{side}", f"dep_new_str_{side}", f"dep_new_note_{side}"):
        st.session_state.pop(key, None)


def render_requires(focus: dict) -> None:
    st.subheader("⬅ Requires")
    st.caption("Watch these first. Each edge is stored on this title.")
    edges = focus.get("prerequisites", [])
    if not edges:
        st.caption("Nothing yet.")
    for edge in list(edges):
        other = movie_by_id(edge["id"])
        if other is None:  # validation forbids it, but never render a crash
            st.warning(f"Dangling prerequisite `{edge['id']}`")
            continue
        render_edge_row(focus, edge, other)

    taken = {edge["id"] for edge in edges}
    earlier = movies()[: find_index(focus["id"])]
    render_connect_form(
        "requires", focus,
        [movie["id"] for movie in earlier if movie["id"] not in taken],
        "➕ Add a prerequisite",
        "Nothing eligible — a prerequisite has to sit earlier in the timeline. "
        "Reorder in the sidebar first.",
    )


def render_unlocks(focus: dict, dependents: list[tuple[dict, dict]]) -> None:
    st.subheader("Unlocks ➡")
    st.caption("These depend on it. Each edge is stored on the other title.")
    if not dependents:
        st.caption("Nothing yet.")
    for owner, edge in dependents:
        render_edge_row(owner, edge, owner)

    taken = {owner["id"] for owner, _ in dependents}
    later = movies()[find_index(focus["id"]) + 1 :]
    render_connect_form(
        "unlocks", focus,
        [movie["id"] for movie in later if movie["id"] not in taken],
        "➕ Add a title that depends on this one",
        "Nothing eligible — only titles later in the timeline can depend on this "
        "one. Reorder in the sidebar first.",
    )


def render_focus_warnings(focus: dict) -> None:
    """Warnings that name the focused title -- redundancy, orphanhood.

    The catalog keeps its edges transitively reduced, so the moment that stops
    being true is worth seeing right here rather than in the status popover.
    """
    catalog, problems = validate_document(st.session_state.document)
    if problems or catalog is None:
        return
    hits = [warning for warning in catalog.warnings if focus["title"] in warning]
    if hits:
        st.info("\n".join(f"- {warning}" for warning in hits))


def render_dependencies() -> None:
    if not movies():
        st.info("Add a title first.")
        return

    ids = [movie["id"] for movie in movies()]
    if st.session_state.get("dep_focus_id") not in ids:
        st.session_state.dep_focus_id = ids[0]

    pick_col, count_col = st.columns([3, 2])
    with pick_col:
        st.selectbox(
            "Title", ids,
            format_func=lambda i: f"{find_index(i) + 1}. {label_of(movie_by_id(i))}",
            key="dep_focus_id", label_visibility="collapsed",
        )
    focus = movie_by_id(st.session_state.dep_focus_id)
    dependents = dependents_of(focus["id"])
    with count_col:
        st.caption(
            f"requires {len(focus.get('prerequisites', []))} · unlocks {len(dependents)}"
        )

    if st.session_state.link_error:
        st.error("Change rejected and undone — nothing was written to mcu.json:")
        for problem in st.session_state.link_error:
            st.write(f"- {problem}")

    requires_col, unlocks_col = st.columns(2)
    with requires_col:
        render_requires(focus)
    with unlocks_col:
        render_unlocks(focus, dependents)

    render_focus_warnings(focus)


# --------------------------------------------------------------------------- #
# Sidebar
# --------------------------------------------------------------------------- #
def render_sidebar() -> None:
    st.sidebar.header("⇅ Timeline")
    st.sidebar.caption("Drag a title to reorder the chronological array.")
    render_reorder(st.sidebar)


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    st.set_page_config(page_title="MARVEL catalog editor", page_icon="🎬", layout="wide")
    ensure_state()
    render_sidebar()
    title_col, rail_col = st.columns([6, 1])
    with title_col:
        st.title("🎬 MARVEL catalog editor")
    with rail_col:
        render_status_menu()
    gallery_tab, dependencies_tab = st.tabs(["🖼 Gallery", "🔗 Dependencies"])
    with gallery_tab:
        render_toolbar()
        render_gallery()
    with dependencies_tab:
        render_dependencies()


if __name__ == "__main__":
    main()
