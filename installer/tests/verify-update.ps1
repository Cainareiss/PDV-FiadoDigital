param([Parameter(Mandatory=$true)][string]$PackageDir)
$ErrorActionPreference = 'Stop'
$repo = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$output = Join-Path $PSScriptRoot 'output'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$testExe = Join-Path $output 'Updater.Tests.exe'
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' /nologo /target:exe /main:UpdaterTests /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll "/out:$testExe" (Join-Path $repo 'installer\Updater.cs') (Join-Path $PSScriptRoot 'Updater.Tests.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar teste do atualizador.' }
$fixture = Join-Path $output ("Loja d'Aline [teste]-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixture 'app\dist'), (Join-Path $fixture 'app\public') -Force | Out-Null
$payload = Join-Path $PackageDir 'payload'
Copy-Item -LiteralPath (Join-Path $payload 'MP-Pedrinhas.exe') -Destination $fixture
Copy-Item -LiteralPath (Join-Path $payload 'Iniciar-PDV.bat') -Destination $fixture
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'old-program.js') -Destination (Join-Path $fixture 'app\dist\index.js')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'old-program.js') -Destination (Join-Path $fixture 'app\public\index.html')
& node (Join-Path $repo 'installer\verify-update.cjs') prepare $fixture 137
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar produtos de teste.' }
$db = Join-Path $fixture 'app\data\client.db'
$envFile = Join-Path $fixture 'app\.env'
$dbHash = (Get-FileHash -LiteralPath $db).Hash
$envHash = (Get-FileHash -LiteralPath $envFile).Hash
$previousHash = (Get-FileHash -LiteralPath (Join-Path $fixture 'app\dist\index.js')).Hash
& $testExe (Join-Path $PSScriptRoot 'echo-path.ps1') (Join-Path $PackageDir 'Atualizar-PDV.ps1') $fixture
if ($LASTEXITCODE -ne 0) { throw 'Falha na atualizacao de teste.' }
if ((Get-FileHash -LiteralPath $db).Hash -ne $dbHash -or (Get-FileHash -LiteralPath $envFile).Hash -ne $envHash) { throw 'Dados ou configuracao alterados.' }
& node (Join-Path $repo 'installer\verify-update.cjs') verify $fixture 137
if ($LASTEXITCODE -ne 0) { throw 'Produtos ou quantidades alterados.' }
if ((Get-FileHash -LiteralPath (Join-Path $fixture 'app\dist\index.js')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $payload 'app\dist\index.js')).Hash) { throw 'Programa novo nao instalado.' }
$backup = Get-ChildItem -LiteralPath (Join-Path $fixture 'backups') -Directory | Select-Object -First 1
if ((Get-FileHash -LiteralPath (Join-Path $backup.FullName 'banco-original.db')).Hash -ne $dbHash) { throw 'Backup do banco divergente.' }
if ((Get-FileHash -LiteralPath (Join-Path $backup.FullName 'programa-anterior\app\dist\index.js')).Hash -ne $previousHash) { throw 'Programa anterior nao guardado.' }
Write-Host 'PASS: programa atualizado, 137 produtos e estoques preservados, .env intacto, banco e programa anterior no backup.'
Write-Host "Instalacao de teste: $fixture"
