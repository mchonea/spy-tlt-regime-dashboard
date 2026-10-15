# setup-schedule.ps1  - called by "Setup Market Schedule.bat". Idempotent.
# 1) ensures FRED_API_KEY is in Credential Manager  2) (re)registers the scheduled task
# 3) removes the old task  4) runs one update and prints the result.

param([switch]$RemoveTask)

$ErrorActionPreference = 'Stop'
$here   = $PSScriptRoot
$script = Join-Path $here 'update-market-data.ps1'
$taskName = 'Market Dashboard Data Update'
$oldTask  = 'TLT Dashboard Data Update'

if (-not (Test-Path $script)) { throw "Cannot find $script" }

# -RemoveTask: retire the local task once GitHub Actions is doing the updates (spec 11.1.1)
if ($RemoveTask) {
    foreach ($n in @($taskName, $oldTask)) {
        if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $n -Confirm:$false
            Write-Host "Removed scheduled task '$n'." -ForegroundColor Green
        }
    }
    Write-Host 'Local scheduled updates are off. Updates now come from GitHub Actions.' -ForegroundColor Cyan
    exit 0
}

# 1) key
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -EnsureKey
if ($LASTEXITCODE -ne 0) { Write-Host 'FRED key is required. Aborting.' -ForegroundColor Red; exit 1 }

# 2) task: 7:00 AM and 6:30 PM Eastern, expressed in this machine's local time
$eastern = [TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time')
function ToLocalTime([int]$h, [int]$m) {
    $e = [DateTime]::SpecifyKind((Get-Date).Date.AddHours($h).AddMinutes($m), [DateTimeKind]::Unspecified)
    return [TimeZoneInfo]::ConvertTime($e, $eastern, [TimeZoneInfo]::Local)
}
$t1 = ToLocalTime 7 0
$t2 = ToLocalTime 18 30

$arg = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg -WorkingDirectory $here
$trigs  = @(
    (New-ScheduledTaskTrigger -Daily -At $t1),
    (New-ScheduledTaskTrigger -Daily -At $t2)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$me = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigs -Settings $settings -Principal $principal `
    -Description 'Pulls FRED + price data for the SPY-TLT regime dashboard (7:00 AM and 6:30 PM Eastern).' | Out-Null
Write-Host ("Registered task '{0}' (daily {1:h:mm tt} and {2:h:mm tt} local = 7:00 AM / 6:30 PM Eastern)." -f $taskName, $t1, $t2) -ForegroundColor Green
Write-Host "  Action: powershell.exe $arg"

# 3) old task
if (Get-ScheduledTask -TaskName $oldTask -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $oldTask -Confirm:$false
    Write-Host "Removed old task '$oldTask'." -ForegroundColor Green
}

# 4) run once now
Write-Host ''
Write-Host 'Running one update now...' -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script
$rc = $LASTEXITCODE
Write-Host ''
if ($rc -eq 0)     { Write-Host 'Update finished OK.' -ForegroundColor Green }
elseif ($rc -eq 2) { Write-Host 'Update finished with some failed series (see above / update-log.txt).' -ForegroundColor Yellow }
else               { Write-Host "Update FAILED (exit $rc). See update-log.txt." -ForegroundColor Red }
exit $rc
