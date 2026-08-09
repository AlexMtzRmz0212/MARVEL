@echo off
setlocal
cd /d "%~dp0"

REM Catalog editor:
REM - Launches the local Streamlit tool for organising and editing mcu.json.
REM - Reads/writes backend/app/seed/data/mcu.json and validates before saving.
REM - Needs TMDB_API_KEY in the root .env for the TMDb picker.

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

if not exist "backend\.venv\Scripts\streamlit.exe" (
    echo [!] Streamlit is not installed in the virtualenv.
    echo     Install the dev dependencies:
    echo.
    echo       backend\.venv\Scripts\python.exe -m pip install -e "backend[dev]"
    echo.
    pause
    exit /b 1
)

pushd backend
".venv\Scripts\streamlit.exe" run scripts\catalog_editor.py %*
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%
