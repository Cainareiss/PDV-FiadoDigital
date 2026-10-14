@echo off
chcp 65001 >nul
title MP Pedrinhas - PDV
cd /d "%~dp0"

if exist "MP-Pedrinhas.exe" (
    start "" "MP-Pedrinhas.exe"
    exit /b 0
)

set "PATH=%~dp0runtime;%PATH%"
cd /d "%~dp0app"
set "PORT=31987"
start "" /B "%~dp0runtime\node.exe" "dist\index.js"
timeout /t 2 >nul
start "" "http://127.0.0.1:31987"
exit /b 0
