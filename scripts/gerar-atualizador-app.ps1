$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $root ('installer\release-1.0.8-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $stage 'payload\app\public') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'apps\api\dist') -Destination (Join-Path $stage 'payload\app') -Recurse
Get-ChildItem -LiteralPath (Join-Path $root 'apps\web\dist') | Copy-Item -Destination (Join-Path $stage 'payload\app\public') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'installer\dist-payload\MP-Pedrinhas.exe') -Destination (Join-Path $stage 'payload')
Copy-Item -LiteralPath (Join-Path $root 'installer\Iniciar-PDV.bat') -Destination (Join-Path $stage 'payload')
Copy-Item -LiteralPath (Join-Path $root 'installer\Atualizar-PDV.ps1') -Destination $stage
$apiPayload = [IO.Path]::GetFullPath((Join-Path $stage 'payload\app\dist'))
# Testes compilados sao artefatos de desenvolvimento e nao fazem parte do programa instalado.
foreach ($testFile in (Get-ChildItem -LiteralPath $apiPayload -Recurse -File -Filter '*.spec.js')) {
  if (-not $testFile.FullName.StartsWith($apiPayload + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Caminho de teste fora do pacote.' }
  Remove-Item -LiteralPath $testFile.FullName -Force
}
$bad = Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object { $_.Name -eq '.env' -or $_.Name -match '\.(db|sqlite)(-|$)' }
if ($bad) { throw 'Pacote contem arquivos de dados.' }
$tokens = $null; $errorsFound = $null
[void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $stage 'Atualizar-PDV.ps1'), [ref]$tokens, [ref]$errorsFound)
if ($errorsFound.Count) { throw ($errorsFound | Out-String) }
$zip = Join-Path $stage 'update.zip'
Compress-Archive -Path (Join-Path $stage 'payload'), (Join-Path $stage 'Atualizar-PDV.ps1') -DestinationPath $zip
$exe = Join-Path $root 'Atualizador-MP-Pedrinhas-PDV-1.0.8.exe'
$manifest = Join-Path $root 'installer\Updater.manifest'
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:winexe /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll "/out:$exe" "/win32manifest:$manifest" "/resource:$zip,update.zip" (Join-Path $root 'installer\Updater.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o aplicativo.' }
Get-FileHash -LiteralPath $exe -Algorithm SHA256
