"""A local, visual editor for the curated catalog.

Run it with `catalog.bat` (repo root) or:

    cd backend
    .venv\\Scripts\\streamlit.exe run scripts\\catalog_editor.py

The catalog is a wall of movies, so the editor looks like one: a grid of
posters you click to edit in a pop-up, drag to reorder, and that saves itself.

* Click a poster to edit it in a focused dialog -- no long scrolling form.
* The dialog's TMDb picker shows *every* match (poster, year, overview) and you
  choose, so "X-Men: First Class" can't silently match a making-of special.
* Every change is validated with the same checks as `app.seed.loader --check`
  and, if valid, written straight back to mcu.json. Nothing invalid is ever
  saved, so a bad edit can't become a 500 on the deployed site.
"""

from __future__ import annotations

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
    """Read mcu.json verbatim, preserving `$comment` and `version`."""
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def ensure_state() -> None:
    st.session_state.setdefault("document", load_document())
    st.session_state.setdefault("candidates", [])
    st.session_state.setdefault("draft_for", None)
    st.session_state.setdefault("search", "")
    st.session_state.setdefault("universe_filter", [])


def movies() -> list[dict]:
    return st.session_state.document["movies"]


def find_index(movie_id: str) -> int | None:
    for index, movie in enumerate(movies()):
        if movie["id"] == movie_id:
            return index
    return None


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


def autosave() -> None:
    """Validate the working document and, if valid, write it back to disk.

    Called after every deliberate change (a dialog save, a delete, a drag), so
    there is no separate 'save' step -- but an invalid document (a cycle, a bad
    date) is never written, only surfaced.
    """
    catalog, problems = validate_document(st.session_state.document)
    if problems:
        st.session_state.save_error = problems
        st.toast("Not saved — validation failed. See the sidebar.", icon="⚠️")
        return

    if SEED_PATH.exists():
        shutil.copy2(SEED_PATH, SEED_PATH.with_name(f"{SEED_PATH.name}.bak"))
    SEED_PATH.write_text(
        json.dumps(st.session_state.document, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    st.session_state.save_error = None
    st.session_state.warnings = list(catalog.warnings)
    st.toast("Saved to mcu.json", icon="💾")


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
    ss.draft_saga = s.get("saga", "multiverse")
    ss.draft_universe = s.get("universe", "mcu")
    ss.draft_media_type = s.get("media_type", "film")
    ss.draft_tier = s.get("tier", "core")
    ss.draft_runtime = int(s["runtime_min"]) if s.get("runtime_min") else 0
    ss.draft_tmdb_id = int(s["tmdb_id"]) if s.get("tmdb_id") else 0
    ss.draft_poster_url = s.get("poster_url") or ""
    ss.draft_synopsis = s.get("synopsis") or ""
    ss.draft_prereqs = [dict(p) for p in s.get("prerequisites", [])]
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
        movies().append(entry)
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
    if movie["universe"] != "mcu":
        badges.append(movie["universe"])
    badge_text = " · ".join(b for b in badges if b)
    st.markdown(f"**{movie['title']}**  \n{year_of(movie)} · {badge_text}")
    if st.button("✏️ Edit", key=f"edit_{movie['id']}", width="stretch"):
        edit_dialog(movie["id"])


def render_reorder() -> None:
    with st.expander("⇅ Reorder the in-universe timeline (drag)"):
        if sort_items is None:
            st.info("Install `streamlit-sortables` to drag-reorder.")
            return
        st.caption("Array order is the chronological order. Drag a title, then it saves.")
        labels = [f"{movie['title']}  ·  {movie['id']}" for movie in movies()]
        new_order = sort_items(labels, direction="vertical", key="reorder")
        if new_order and new_order != labels:
            id_order = [label.rsplit("  ·  ", 1)[1] for label in new_order]
            by_id = {movie["id"]: movie for movie in movies()}
            st.session_state.document["movies"] = [by_id[movie_id] for movie_id in id_order]
            autosave()
            st.rerun()


# --------------------------------------------------------------------------- #
# Sidebar
# --------------------------------------------------------------------------- #
def render_sidebar() -> None:
    st.sidebar.header("🎬 Catalog")
    st.sidebar.caption(str(SEED_PATH))

    catalog, problems = validate_document(st.session_state.document)
    if problems:
        st.sidebar.error(f"{len(problems)} problem(s) — not saving until fixed")
        for problem in problems:
            st.sidebar.write(f"- {problem}")
    else:
        st.sidebar.success(f"Valid · {len(movies())} titles · {len(catalog.edges)} edges")
        warnings = st.session_state.get("warnings") or catalog.warnings
        if warnings:
            with st.sidebar.expander(f"{len(warnings)} warning(s)"):
                for warning in warnings:
                    st.write(f"- {warning}")

    st.sidebar.caption("Changes auto-save to mcu.json when valid.")
    st.sidebar.divider()
    if st.sidebar.button("↻ Reload from disk", width="stretch"):
        st.session_state.document = load_document()
        st.session_state.draft_for = None
        st.rerun()


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    st.set_page_config(page_title="MARVEL catalog editor", page_icon="🎬", layout="wide")
    ensure_state()
    render_sidebar()
    st.title("🎬 MARVEL catalog editor")
    render_toolbar()
    render_reorder()
    render_gallery()


if __name__ == "__main__":
    main()
