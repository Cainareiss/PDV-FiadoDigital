param(
  [string]$InstallDir = "C:\MP-Pedrinhas-PDV",
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
$packageDir = Join-Path $PSScriptRoot "payload"

function Find-InstalledPdvDirectory {
  $roots = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
  )
  foreach ($root in $roots) {
    if (-not (Test-Path $root)) { continue }
    foreach ($entry in (Get-ChildItem $root -ErrorAction SilentlyContinue)) {
      $app = Get-ItemProperty $entry.PSPath -ErrorAction SilentlyContinue
      if ($app.DisplayName -like "*MP Pedrinhas*" -and $app.InstallLocation) {
        try {
          $candidate = [IO.Path]::GetFullPath(([string]$app.InstallLocation).Trim().Trim('"'))
          if (Test-Path -LiteralPath (Join-Path $candidate "MP-Pedrinhas.exe") -PathType Leaf) { return $candidate }
        } catch { continue }
      }
    }
  }
  return $null
}

if (-not (Test-Path -LiteralPath (Join-Path $packageDir "MP-Pedrinhas.exe")) -or
    -not (Test-Path -LiteralPath (Join-Path $packageDir "app\dist\index.js")) -or
    -not (Test-Path -LiteralPath (Join-Path $packageDir "app\public\index.html"))) {
  throw "Pacote incompleto. Extraia o ZIP inteiro antes de executar Atualizar-PDV.bat."
}

if (-not $PSBoundParameters.ContainsKey('InstallDir')) {
  $registeredDir = Find-InstalledPdvDirectory
  if ($registeredDir) { $InstallDir = $registeredDir }
}
try {
  $InstallDir = [IO.Path]::GetFullPath($InstallDir.Trim().Trim('"'))
} catch { throw "Caminho de instalacao invalido. Selecione a pasta do PDV pelo botao Procurar." }
$launcherPath = Join-Path $InstallDir "MP-Pedrinhas.exe"
if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  throw "PDV nao encontrado em '$InstallDir'. Informe o caminho correto em InstallDir."
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $command = "& '" + $PSCommandPath.Replace("'", "''") + "' -InstallDir '" + $InstallDir.Replace("'", "''") + "'"
  if ($NoRestart) { $command += " -NoRestart" }
  $command = "try { " + $command + "; exit 0 } catch { Write-Error `$_ -ErrorAction Continue; exit 1 }"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
  $child = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList "-NoProfile -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand $encoded" -Wait -PassThru -WindowStyle Hidden
  exit $child.ExitCode
}

Write-Host "Instalacao selecionada: $InstallDir"

$backendScript = Join-Path $InstallDir "app\dist\index.js"
$nodePath = Join-Path $InstallDir "runtime\node.exe"
$backendProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { ($_.ExecutablePath -eq $nodePath) -or ($_.CommandLine -and $_.CommandLine.IndexOf($backendScript, [StringComparison]::OrdinalIgnoreCase) -ge 0) }
foreach ($processInfo in $backendProcesses) {
  Stop-Process -Id $processInfo.ProcessId -Force -ErrorAction SilentlyContinue
}

$launcherProcesses = Get-CimInstance Win32_Process -Filter "Name = 'MP-Pedrinhas.exe'" |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath.Equals($launcherPath, [StringComparison]::OrdinalIgnoreCase) }
foreach ($processInfo in $launcherProcesses) {
  Stop-Process -Id $processInfo.ProcessId -Force -ErrorAction SilentlyContinue
}

$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 250
  $activeBackend = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { ($_.ExecutablePath -eq $nodePath) -or ($_.CommandLine -and $_.CommandLine.IndexOf($backendScript, [StringComparison]::OrdinalIgnoreCase) -ge 0) }
} while ($activeBackend -and (Get-Date) -lt $deadline)
if ($activeBackend) { throw "Nao foi possivel encerrar o servidor do PDV com seguranca; nenhum arquivo foi atualizado." }

$appDir = Join-Path $InstallDir "app"
$dataDir = Join-Path $appDir "data"
$stamp = (Get-Date -Format "yyyyMMdd-HHmmss") + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$backupDir = Join-Path (Join-Path $InstallDir "backups") "antes-da-atualizacao-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

# Guarda a pasta de dados inteira e tambem o SQLite configurado em .env, se estiver fora dela.
if (Test-Path -LiteralPath $dataDir) {
  Copy-Item -LiteralPath $dataDir -Destination (Join-Path $backupDir "data") -Recurse -Force
}
$envPath = Join-Path $appDir ".env"
$databasePath = Join-Path $dataDir "dev.db"
if (Test-Path -LiteralPath $envPath) {
  $databaseLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if ($databaseLine -match '^\s*DATABASE_URL\s*=\s*(.*?)\s*$') {
    $databaseValue = $Matches[1].Trim().Trim('"').Trim("'")
    if ($databaseValue.StartsWith("file:", [StringComparison]::OrdinalIgnoreCase)) {
      $databaseValue = $databaseValue.Substring(5)
    }
    if ($databaseValue) {
      $databasePath = if ([IO.Path]::IsPathRooted($databaseValue)) { $databaseValue } else { Join-Path $appDir $databaseValue }
    }
  }
}
$databasePath = [IO.Path]::GetFullPath($databasePath)
$databaseDirectory = Split-Path -Parent $databasePath
$databaseBackupDir = Join-Path $backupDir "database-configurada"
if ((Test-Path -LiteralPath $databaseDirectory) -and -not $databaseDirectory.Equals($dataDir, [StringComparison]::OrdinalIgnoreCase)) {
  New-Item -ItemType Directory -Path $databaseBackupDir -Force | Out-Null
  foreach ($suffix in @("", "-wal", "-shm")) {
    $source = "$databasePath$suffix"
    if (Test-Path -LiteralPath $source -PathType Leaf) {
      Copy-Item -LiteralPath $source -Destination $databaseBackupDir -Force
    }
  }
}

$protectedFiles = @()
if (Test-Path -LiteralPath $dataDir) {
  $protectedFiles += Get-ChildItem -LiteralPath $dataDir -File -Recurse
}
foreach ($suffix in @("", "-wal", "-shm")) {
  $source = "$databasePath$suffix"
  if ((Test-Path -LiteralPath $source -PathType Leaf) -and
      -not ($protectedFiles.FullName -contains $source)) {
    $protectedFiles += Get-Item -LiteralPath $source
  }
}
$protectedHashes = @{}
if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
  throw "Banco existente nao localizado em $databasePath. Atualizacao cancelada para evitar abrir uma base vazia."
}
Copy-Item -LiteralPath $databasePath -Destination (Join-Path $backupDir 'banco-original.db')
if ((Get-FileHash -LiteralPath $databasePath).Hash -ne (Get-FileHash -LiteralPath (Join-Path $backupDir 'banco-original.db')).Hash) { throw 'Falha ao verificar backup.' }
if (Test-Path -LiteralPath $envPath) { Copy-Item -LiteralPath $envPath -Destination $backupDir }
foreach ($program in @('app\dist', 'app\public', 'MP-Pedrinhas.exe', 'Iniciar-PDV.bat')) {
  $old = Join-Path $InstallDir $program
  if (Test-Path -LiteralPath $old) {
    $dest = Join-Path (Join-Path $backupDir 'programa-anterior') $program
    New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $old -Destination $dest -Recurse -Force
  }
}
foreach ($file in $protectedFiles) {
  $protectedHashes[$file.FullName] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
}
if (Test-Path -LiteralPath $envPath) {
  $protectedHashes[$envPath] = (Get-FileHash -LiteralPath $envPath -Algorithm SHA256).Hash
}

New-Item -ItemType Directory -Path $appDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $packageDir "app\dist") -Destination $appDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $packageDir "app\public") -Destination $appDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $packageDir "MP-Pedrinhas.exe") -Destination $InstallDir -Force
Copy-Item -LiteralPath (Join-Path $packageDir "Iniciar-PDV.bat") -Destination $InstallDir -Force

foreach ($path in $protectedHashes.Keys) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Verificacao de preservacao falhou: arquivo existente desapareceu ('$path'). Backup: $backupDir"
  }
  $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  if ($actualHash -ne $protectedHashes[$path]) {
    throw "Verificacao de preservacao falhou: arquivo foi alterado ('$path'). Backup: $backupDir"
  }
}

Write-Host "Banco e configuracoes preservados. Copia de seguranca: $backupDir" -ForegroundColor Green
if (-not $NoRestart) { Start-Process $launcherPath }
Write-Host "Atualizacao concluida. Dados e configuracoes conferidos." -ForegroundColor Green
