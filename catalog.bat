@echo off
setlocal
cd /d "%~dp0"

REM Catalog editor:
REM - The editor is part of the app now, at /admin. This starts the API (8000)
REM   and the Vite dev server (5173), then opens it.
REM - With no ADMIN_PASSWORD_HASH in backend\.env the editor is open in dev, so
REM   there is no password to type here. Set one to try the real sign-in.
REM - Edits are saved to the database DATABASE_URL names in backend\.env and are
REM   live at once for anything reading that database. It needs the catalog
REM   tables: run "alembic upgrade head" from the backend folder.
REM - Needs TMDB_API_KEY in the root .env for the TMDb picker.

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

echo   [*] Starting the API on http://localhost:8000
start "" /b cmd /c "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

echo   [*] Starting the web app on http://localhost:5173
start "" /b cmd /c "cd /d "%~dp0frontend" && npm run dev"

echo.
echo   Waiting for the servers to come up...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5173/admin"

echo.
echo   Running.
echo     editor   http://localhost:5173/admin
echo     site     http://localhost:5173
echo     api      http://localhost:8000/api/docs
echo.
echo   Both servers are running in this terminal window.
echo   Press Ctrl+C in this window to stop them.
echo.

REM Keep this console alive while both background jobs stream logs.
:wait_loop
timeout /t 3600 >nul
goto wait_loop
