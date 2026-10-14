param([ValidateSet('start','update','status','stop')][string]$Mode = 'status')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$scannerRoot = Join-Path $projectRoot '.local\clamav'
$engineRoot = Join-Path $scannerRoot 'engine\clamav-1.4.6.win.x64'
$databaseRoot = Join-Path $scannerRoot 'db'
$logRoot = Join-Path $scannerRoot 'logs'
$runRoot = Join-Path $scannerRoot 'run'
foreach ($folder in @($databaseRoot,$logRoot,$runRoot)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }
$clamConfig = Join-Path $scannerRoot 'clamd.conf'
$freshConfig = Join-Path $scannerRoot 'freshclam.conf'
@"
DatabaseDirectory $databaseRoot
LogFile $logRoot\clamd.log
LogTime yes
LogFileMaxSize 5M
LogRotate yes
TCPSocket 3310
TCPAddr 127.0.0.1
Foreground yes
MaxThreads 2
MaxQueue 8
StreamMaxLength 15M
MaxFileSize 25M
MaxScanSize 100M
AlertExceedsMax yes
ReadTimeout 30
SelfCheck 60
ConcurrentDatabaseReload no
"@ | Set-Content -LiteralPath $clamConfig -Encoding ascii
@"
DatabaseDirectory $databaseRoot
DatabaseMirror database.clamav.net
DNSDatabaseInfo current.cvd.clamav.net
UpdateLogFile $logRoot\freshclam.log
LogTime yes
LogFileMaxSize 5M
LogRotate yes
Checks 4
Foreground yes
ConnectTimeout 20
ReceiveTimeout 60
"@ | Set-Content -LiteralPath $freshConfig -Encoding ascii

function Get-OwnedScanner([string]$name) {
  $pidFile = Join-Path $runRoot "$name.pid"
  if (Test-Path -LiteralPath $pidFile) {
    $scannerPid = [int](Get-Content -LiteralPath $pidFile -Raw)
    $scannerProcess = Get-Process -Id $scannerPid -ErrorAction SilentlyContinue
    $expectedExecutable = Join-Path $engineRoot "$name.exe"
    if ($scannerProcess -and $scannerProcess.Path -eq $expectedExecutable) { return $scannerProcess }
  }
  return $null
}

if ($Mode -eq 'update') {
  if (Get-OwnedScanner 'freshclam') { throw 'Stop the local updater before requesting a manual update.' }
  & (Join-Path $engineRoot 'freshclam.exe') "--config-file=$freshConfig"
  if ($LASTEXITCODE -ne 0) { throw 'Official virus database update failed. Uploads must remain blocked.' }
} elseif ($Mode -eq 'start') {
  if (-not (Test-Path -LiteralPath (Join-Path $databaseRoot 'daily.cvd')) -and -not (Test-Path -LiteralPath (Join-Path $databaseRoot 'daily.cld'))) { throw 'Run update successfully before starting ClamAV.' }
  foreach ($name in @('clamd','freshclam')) {
    if (-not (Get-OwnedScanner $name)) {
      $configuration = if ($name -eq 'clamd') { $clamConfig } else { $freshConfig }
      $scannerArguments = @("--config-file=`"$configuration`"")
      if ($name -eq 'freshclam') { $scannerArguments += '--daemon' }
      $scannerProcess = Start-Process -FilePath (Join-Path $engineRoot "$name.exe") -ArgumentList $scannerArguments -WorkingDirectory $engineRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot "$name.stdout.log") -RedirectStandardError (Join-Path $logRoot "$name.stderr.log")
      $scannerProcess.Id | Set-Content -LiteralPath (Join-Path $runRoot "$name.pid") -Encoding ascii
    }
  }
  Write-Output 'Local scanner and updater started. Verify readiness before uploading.'
} elseif ($Mode -eq 'stop') {
  foreach ($name in @('freshclam','clamd')) {
    $scannerProcess = Get-OwnedScanner $name
    if ($scannerProcess) { Stop-Process -Id $scannerProcess.Id }
  }
  Write-Output 'Project-local ClamAV processes stopped.'
} else {
  foreach ($name in @('clamd','freshclam')) {
    $scannerProcess = Get-OwnedScanner $name
    Write-Output "$name running: $([bool]$scannerProcess)"
  }
}
