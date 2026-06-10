# ===================================================================
# AI WORLD - Windows ütemezett feladat regisztrálása
# ===================================================================
# Létrehoz egy napi feladatot a Windows Feladatütemezőben, ami
# minden reggel 8:00-kor lefuttatja a pipeline-t (amíg a gép be van kapcsolva).
#
# FUTTATÁS (egyszer, jobb klikk -> Futtatás PowerShell-lel, VAGY):
#   powershell -ExecutionPolicy Bypass -File scheduled\register-task.ps1
#
# TÖRLÉS: Unregister-ScheduledTask -TaskName "AIWorldDailyPipeline" -Confirm:$false
# ===================================================================

$taskName = "AIWorldDailyPipeline"
$batPath  = "C:\AI work\ai-world-co\scheduled\daily.bat"
$runTime  = "08:00"

if (-not (Test-Path $batPath)) { Write-Error "Nem talalom: $batPath"; exit 1 }

$action  = New-ScheduledTaskAction -Execute $batPath
$trigger = New-ScheduledTaskTrigger -Daily -At $runTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd

try { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue } catch {}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "AI World Co. napi agent-pipeline (Scraper->Iro->Ellenorzo->Designer->Publisher)" | Out-Null

Write-Host "[OK] Utemezett feladat letrehozva: '$taskName' - minden nap $runTime"
Write-Host "     A gepnek bekapcsolva kell lennie ekkor. Felhos (gep nelkuli) futashoz: GitHub Actions."
Write-Host "     Torles: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
