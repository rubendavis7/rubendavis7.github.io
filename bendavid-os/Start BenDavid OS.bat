@echo off
title BenDavid OS
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Install the LTS version from https://nodejs.org
  echo  then double-click this file again.
  echo.
  pause
  exit /b 1
)
if not exist "node_modules\@anthropic-ai\sdk\package.json" (
  echo First run: installing the Anthropic SDK used by the optional AI service...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 echo  Could not install it. Everything else still works; the AI service will show as unavailable.
)
echo Starting BenDavid OS...
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:4321"
node server\server.js
pause
