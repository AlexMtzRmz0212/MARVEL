@echo off
setlocal
cd /d "%~dp0"

REM Catalog editor:
REM - Starts the local editor API (backend/scripts/catalog_api.py) on port 8010
REM   and the Vite dev server on 5173, then opens the editor.
REM - Reads/writes backend/app/seed/data/mcu.json and validates before saving.
REM - Needs TMDB_API_KEY in the root .env for the TMDb picker.
REM
REM The editor is a second Vite entry point (frontend/editor.html). Vite only
REM builds index.html, so it exists in dev and never ships.

echo.
echo   Marvel catalog editor
echo   ---------------------
echo.

if not exist "backend\.venv\Scripts\python.exe" (
    echo   [!] Backend virtualenv is missing.
    echo       Create it with:
    echo.
    echo         cd backend
    echo         python -m venv .venv
    echo         .venv\Scripts\python.exe -m pip install -e ".[dev]"
    echo.
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo   [*] Installing frontend dependencies, this only happens once...
    pushd frontend
    call npm install
    if errorlevel 1 (
        popd
        echo   [!] npm install failed.
        pause
        exit /b 1
    )
    popd
    echo.
)

echo   [*] Starting the editor API on http://127.0.0.1:8010
start "" /b cmd /c "cd /d "%~dp0backend" && .venv\Scripts\python.exe scripts\catalog_api.py"

echo   [*] Starting the web app on http://localhost:5173
start "" /b cmd /c "cd /d "%~dp0frontend" && npm run dev"

echo.
echo   Waiting for the servers to come up...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5173/editor.html"

echo.
echo   Running.
echo     editor   http://localhost:5173/editor.html
echo     api      http://127.0.0.1:8010/editor-api/docs
echo.
echo   Both servers are running in this terminal window.
echo   Press Ctrl+C in this window to stop them.
echo.

REM Keep this console alive while both background jobs stream logs.
:wait_loop
timeout /t 3600 >nul
goto wait_loop
