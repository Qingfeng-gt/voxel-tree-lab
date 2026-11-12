@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 动态树 - Web
where node >nul 2>nul
if errorlevel 1 goto nonode

echo 正在启动本地服务器...
echo.
node serve.mjs --open
set ERR=%errorlevel%
echo.
echo 服务器已退出（代码 %ERR%）。
pause
exit /b %ERR%

:nonode
echo 未找到 Node.js。
echo 请先安装 Node.js（https://nodejs.org/），然后重新双击 start.bat。
pause
exit /b 1
