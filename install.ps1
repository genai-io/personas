# San persona installer for Windows (PowerShell 5.1+)
#
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/genai-io/personas/main/install.ps1))) -Persona codex
#   & ([scriptblock]::Create((irm .../install.ps1))) -Persona codex -User
#   & ([scriptblock]::Create((irm .../install.ps1))) -Persona codex -Dir C:\path\to\project
#
# Default scope is the current project (<cwd>\.san). -User installs to ~\.san.

param(
    [Parameter(Mandatory = $true)]
    [string]$Persona,
    [switch]$User,
    [string]$Dir = '.'
)

$ErrorActionPreference = 'Stop'

$RepoUrl = if ($env:SAN_PERSONAS_REPO) { $env:SAN_PERSONAS_REPO } else { 'https://github.com/genai-io/personas.git' }
$Ref     = if ($env:SAN_PERSONAS_REF)  { $env:SAN_PERSONAS_REF }  else { 'main' }

function Info($m) { Write-Host $m -ForegroundColor Green }
function Fail($m) { Write-Host $m -ForegroundColor Red; exit 1 }

# Resolve the .san config dir by scope.
if ($User) {
    $ConfDir = Join-Path $HOME '.san'
} else {
    $ConfDir = Join-Path ((Resolve-Path $Dir).Path) '.san'
}

# Resolve the repo root holding the persona directories — the checkout when run
# from one, else a fresh clone.
$Tmp = $null
if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'install.ps1'))) {
    $SrcRoot = $PSScriptRoot
} else {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git is required for remote install' }
    $Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('san-personas-' + [System.Guid]::NewGuid().ToString('N'))
    Info "-> fetching personas@$Ref"
    git clone --depth 1 --branch $Ref --quiet $RepoUrl $Tmp
    $SrcRoot = $Tmp
}

# A persona directory is any top-level dir holding settings.json or system\.
function Get-Available {
    Get-ChildItem -Directory $SrcRoot | Where-Object {
        (Test-Path (Join-Path $_.FullName 'settings.json')) -or (Test-Path (Join-Path $_.FullName 'system'))
    } | Select-Object -ExpandProperty Name
}

$Src = Join-Path $SrcRoot $Persona
if (-not (Test-Path $Src)) {
    Write-Host "no persona named '$Persona' in this repo" -ForegroundColor Red
    Write-Host 'available:'
    Get-Available | ForEach-Object { Write-Host "  $_" }
    exit 1
}

# Copy the persona content into <confdir>\personas\<persona>.
$Dest = Join-Path (Join-Path $ConfDir 'personas') $Persona
if (Test-Path $Dest) { Remove-Item -Recurse -Force $Dest }
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$copied = $false
foreach ($item in @('system', 'skills', 'settings.json', 'NOTICE')) {
    $p = Join-Path $Src $item
    if (Test-Path $p) { Copy-Item -Recurse -Force $p $Dest; $copied = $true }
}
if (-not $copied) { Fail "no persona content found in $Src" }
Info "-> installed persona to $Dest"

# Enable: set "persona" in <confdir>\settings.json, preserving other keys.
$Settings = Join-Path $ConfDir 'settings.json'
New-Item -ItemType Directory -Force -Path $ConfDir | Out-Null
if (Test-Path $Settings) {
    try { $data = Get-Content -Raw $Settings | ConvertFrom-Json } catch { $data = [pscustomobject]@{} }
} else {
    $data = [pscustomobject]@{}
}
$data | Add-Member -NotePropertyName persona -NotePropertyValue $Persona -Force
$json = $data | ConvertTo-Json -Depth 20
# UTF-8 without BOM — a BOM would make Go's JSON parser reject the file.
[System.IO.File]::WriteAllText($Settings, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
Info "-> enabled '$Persona' in $Settings"

if ($Tmp -and (Test-Path $Tmp)) { Remove-Item -Recurse -Force $Tmp }

Write-Host ''
Info "[OK] $Persona installed & enabled"
Write-Host "  Persona:  $Dest"
Write-Host "  Enabled:  $Settings  ->  persona = $Persona"
Write-Host ''
Write-Host "Start san in this directory; switch with  /persona $Persona  (or /persona default)."
