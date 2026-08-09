@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

REM Dev runner:
REM - Validates the seed catalog before startup.
REM - Starts backend and frontend in this same terminal window.
REM - Opens the app in a browser and keeps this window alive for logs.

echo.
echo   Marvel Watch Order - local development
echo   -------------------------------------
echo.

REM ---------------------------------------------------------------- checks --
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

REM The catalog is read from JSON at startup, so a broken seed file would take
REM the API down. Catching it here gives a readable error instead of a stack
REM trace in a window that closes.
echo   [*] Validating the catalog...
pushd backend
".venv\Scripts\python.exe" -m app.seed.loader --check
if errorlevel 1 (
    popd
    echo.
    echo   [!] The catalog file is invalid - see the errors above.
    pause
    exit /b 1
)
popd
echo.

REM ---------------------------------------------------------------- launch --
echo   [*] Starting the API on http://localhost:8000 (same window)
start "" /b cmd /c "cd /d "%~dp0backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

echo   [*] Starting the web app on http://localhost:5173 (same window)
start "" /b cmd /c "cd /d "%~dp0frontend" && npm run dev"

echo.
echo   Waiting for the servers to come up...
timeout /t 6 /nobreak >nul

start "" "http://localhost:5173"

echo.
echo   Running.
echo     web   http://localhost:5173
echo     api   http://localhost:8000/api/docs
echo.
echo   Both servers are running in this terminal window.
echo   Press Ctrl+C in this window to stop them.
echo.

REM Keep this console alive while both background jobs stream logs.
:wait_loop
timeout /t 3600 >nul
goto wait_loop
