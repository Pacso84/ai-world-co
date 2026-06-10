@echo off
REM ===================================================================
REM AI WORLD - Napi pipeline futtatas (Windows Task Scheduler hivja)
REM ===================================================================
REM A teljes agent-pipeline lefuttatasa, a kimenet naploba.
REM ===================================================================
cd /d "C:\AI work\ai-world-co"
echo ---- Pipeline indul: %DATE% %TIME% ---->> logs\scheduled.log
node agents\ceo\agent.js >> logs\scheduled.log 2>&1
echo ---- Pipeline vege:  %DATE% %TIME% ---->> logs\scheduled.log
