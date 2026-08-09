@echo off
setlocal
cd /d "%~dp0"

REM TMDB enrich helper:
REM - Runs backend/scripts/enrich_tmdb.py and writes TMDB data to mcu.json.
REM - Updates tmdb_id, poster_url, synopsis, runtime_min, and release_date.
REM - Always refreshes existing TMDB-backed fields with --force.
REM - Requires TMDB_API_KEY in the root .env file.

if not exist "backend\.venv\Scripts\python.exe" (
    echo [!] Backend virtualenv is missing.
    echo     Create it first:
    echo.
    echo       cd backend
    echo       python -m venv .venv
    echo       .venv\Scripts\python.exe -m pip install -e ".[dev]"
    echo.
    pause
    exit /b 1
)

pushd backend
".venv\Scripts\python.exe" scripts\enrich_tmdb.py --force %*
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%