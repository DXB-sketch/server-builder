@echo off
title MONOLITH Server Builder
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist .env (copy .env.example .env >nul & echo Created .env - open it in Notepad, paste your bot token and server IDs, then run start.bat again. & notepad .env & pause & exit /b 0)
if not exist node_modules (echo Installing dependencies... & call npm install --omit=dev || (pause & exit /b 1))
node src/index.js
pause
