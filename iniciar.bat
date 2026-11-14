@echo off
title Pizarra Powerchair - servidor local
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta Node.js. Instalalo desde https://nodejs.org y volve a abrir este archivo. & pause & exit /b)
echo.
echo === npm install ===
call npm install
echo.
echo === npm run dev ===
call npm run dev
pause
