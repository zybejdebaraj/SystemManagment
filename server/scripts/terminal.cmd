@echo off
title Inventory - Server
cd /d "%~dp0.."
echo Inventory server terminal. Press Ctrl+C here to stop only the server.
call npm run dev
