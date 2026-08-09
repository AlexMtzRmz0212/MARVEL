@echo off
setlocal

rem Determine the directory of the batch file
set "SCRIPT_DIR=%~dp0"

rem Change to the project root directory
cd /d "%SCRIPT_DIR%"

rem Execute the Python script
python backend/scripts/insert_movie.py

echo.
echo Script finished. Press any key to exit.
pause > nul
endlocal
