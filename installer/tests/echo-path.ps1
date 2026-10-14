param([string]$InstallDir, [switch]$NoRestart)
$ErrorActionPreference = 'Stop'
if (-not $NoRestart) { throw "NoRestart nao foi transmitido. Caminho recebido: $InstallDir" }
Write-Output ([Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($InstallDir)))
