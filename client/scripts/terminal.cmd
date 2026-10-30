@echo off
title Inventory - Client
cd /d "%~dp0.."
echo Inventory client terminal. Press Ctrl+C here to stop only the client.
call npm run dev
