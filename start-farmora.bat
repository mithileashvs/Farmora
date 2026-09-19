@echo off
setlocal enabledelayedexpansion

rem ============================================================
rem  Farmora startup script (Windows)
rem  Double-click this file, or run it from a command prompt:
rem      start-farmora.bat
rem
rem  What it does:
rem    1. Checks that Node.js is installed
rem    2. Installs backend dependencies if needed (npm install)
rem    3. Creates backend\.env from .env.example on first run
rem       (then stops so you can fill in GROQ_API_KEY / MONGODB_URI)
rem    4. Starts the backend server
rem    5. Opens the app in your default browser
rem
rem  This window must stay open while Farmora is running.
rem  Press Ctrl+C in this window to stop the server.
rem ============================================================

title Farmora

rem Always run relative to this script's own folder, regardless of
rem where it was launched from.
cd /d "%~dp0"

set "BACKEND_DIR=%~dp0backend"
set "PORT=5000"

if not exist "%BACKEND_DIR%" (
    echo [Farmora] ERROR: Could not find the "backend" folder next to this script.
    echo           Expected it at: %BACKEND_DIR%
    goto :fail
)

rem ---------- 1. Check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [Farmora] ERROR: Node.js was not found on your PATH.
    echo.
    echo           Install Node.js 18 or later from https://nodejs.org
    echo           then re-run this script.
    goto :fail
)

for /f "delims=" %%v in ('node --version') do set "NODE_VERSION=%%v"
echo [Farmora] Using Node.js %NODE_VERSION%

cd /d "%BACKEND_DIR%"

rem ---------- 2. Install dependencies ----------
if not exist "node_modules\" (
    echo [Farmora] Installing backend dependencies for the first time — this can take a minute...
    call npm install
    if errorlevel 1 (
        echo [Farmora] ERROR: npm install failed. See the output above for details.
        goto :fail
    )
) else (
    echo [Farmora] Dependencies already installed. ^(Delete backend\node_modules to force a reinstall.^)
)

rem ---------- 3. Set up .env on first run ----------
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo.
        echo [Farmora] Created backend\.env from .env.example.
        echo           Open backend\.env now and set at least:
        echo               GROQ_API_KEY=your_real_key_here
        echo           MongoDB is optional — see backend\.env.example for MONGODB_URI
        echo           and MONGODB_DNS_SERVERS if you use MongoDB Atlas.
        echo.
        echo           Re-run this script once you've saved backend\.env.
        goto :fail
    ) else (
        echo [Farmora] ERROR: backend\.env is missing and backend\.env.example
        echo           was not found either, so a .env could not be created.
        goto :fail
    )
)

rem Warn (but don't block) if the Groq key still looks unset.
findstr /r /c:"^GROQ_API_KEY=$" ".env" >nul 2>nul
if not errorlevel 1 (
    echo.
    echo [Farmora] WARNING: GROQ_API_KEY is empty in backend\.env.
    echo           Chat and image analysis will fail until it's set.
    echo.
)

rem ---------- 4. Start the server ----------
echo.
echo [Farmora] Starting the backend on http://localhost:%PORT% ...
echo           Press Ctrl+C to stop.
echo.

rem Open the browser a couple of seconds after launch, giving the server
rem time to bind to the port. This runs in the background so it doesn't
rem block the server from starting.
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%PORT%"

call npm start
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [Farmora] The server exited with an error ^(code %EXIT_CODE%^).
    goto :fail
)

goto :eof

:fail
echo.
pause
exit /b 1
