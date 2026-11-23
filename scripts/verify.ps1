# Local verification only. Compatible with Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
Set-Location (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $defaultNode = Join-Path $env:ProgramFiles 'nodejs'
    if (Test-Path (Join-Path $defaultNode 'node.exe')) {
        $env:Path = "$defaultNode;$env:Path"
    }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw 'Node.js/npm not found. Install Node.js LTS and restart PowerShell.'
}
& npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'JavaScript syntax check failed.' }
& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
Write-Host 'LIVING WORLD NEXT: local checks passed.'
