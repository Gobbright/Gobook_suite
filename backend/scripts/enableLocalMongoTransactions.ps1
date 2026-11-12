$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script as Administrator.'
}

$configPath = 'C:\Program Files\MongoDB\Server\8.3\bin\mongod.cfg'
$backupPath = 'C:\Program Files\MongoDB\Server\8.3\bin\mongod.cfg.gobook-backup'
$backendPath = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "MongoDB configuration was not found at $configPath"
}

if (-not (Test-Path -LiteralPath $backupPath)) {
  Copy-Item -LiteralPath $configPath -Destination $backupPath
}

$configText = Get-Content -Raw -LiteralPath $configPath
if ($configText -notmatch '(?m)^replication:\s*$') {
  if ($configText -notmatch '(?m)^#replication:\s*$') {
    throw 'The MongoDB configuration has no recognizable replication section.'
  }
  $configText = $configText -replace '(?m)^#replication:\s*$', "replication:`r`n  replSetName: rs0"
  [System.IO.File]::WriteAllText($configPath, $configText, [System.Text.UTF8Encoding]::new($false))
}

Restart-Service -Name MongoDB
Start-Sleep -Seconds 2
Set-Location -LiteralPath $backendPath
& node 'scripts/initializeLocalReplicaSet.mjs'
if ($LASTEXITCODE -ne 0) { throw 'MongoDB replica-set initialization failed.' }

Write-Host 'Local MongoDB transactions are enabled. Restart the GoBook backend if it is not already reconnected.' -ForegroundColor Green
