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
echo Starting BenDavid OS...
start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:4321"
node server\server.js
pause
