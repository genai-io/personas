# San persona installer for Windows (PowerShell 5.1+)
#
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/genai-io/personas/main/install.ps1))) -Persona codex
#   & ([scriptblock]::Create((irm .../install.ps1))) -Persona codex -User
#   & ([scriptblock]::Create((irm .../install.ps1))) -Persona codex -Dir C:\path\to\project
#
# Default scope is the current project (<cwd>\.san). -User installs to ~\.san.

# Re-running the same command updates in place. Local edits under the persona
# directory are detected and moved aside first, never silently discarded.
# -Check reports what is installed and whether it is current, changing nothing.

param(
    [Parameter(Mandatory = $true)]
    [string]$Persona,
    [switch]$User,
    [string]$Dir = '.',
    [switch]$Check
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

$SrcCommit = 'unknown'
if (Get-Command git -ErrorAction SilentlyContinue) {
    $c = git -C $SrcRoot rev-parse HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $c) { $SrcCommit = $c.Trim() }
}

$Dest  = Join-Path (Join-Path $ConfDir 'personas') $Persona
$Stamp = Join-Path $Dest '.install.json'

$CmdHint = "install.ps1 -Persona $Persona"
if ($User) { $CmdHint += ' -User' } elseif ($Dir -ne '.') { $CmdHint += " -Dir $Dir" }

# The stamp records the commit installed and a checksum per file, so a later run
# can tell a stale copy from an edited one.
function Get-FileMap($root) {
    $map = @{}
    if (-not (Test-Path $root)) { return $map }
    Get-ChildItem -Recurse -File $root | ForEach-Object {
        $rel = $_.FullName.Substring($root.Length).TrimStart('\', '/')
        if ($rel -ne '.install.json') {
            $map[$rel] = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
        }
    }
    return $map
}

function Get-Drift {
    if (-not (Test-Path $Stamp)) { return @() }
    try { $files = (Get-Content -Raw $Stamp | ConvertFrom-Json).files } catch { return @() }
    if (-not $files) { return @() }
    $recorded = @{}
    $files.PSObject.Properties | ForEach-Object { $recorded[$_.Name] = $_.Value }
    $now = Get-FileMap $Dest
    $out = @()
    foreach ($rel in $now.Keys) {
        if (-not $recorded.ContainsKey($rel)) { $out += "added    $rel" }
        elseif ($recorded[$rel] -ne $now[$rel]) { $out += "modified $rel" }
    }
    foreach ($rel in $recorded.Keys) { if (-not $now.ContainsKey($rel)) { $out += "removed  $rel" } }
    return $out | Sort-Object
}

function Write-Stamp {
    $data = [ordered]@{
        persona = $Persona; commit = $SrcCommit; ref = $Ref; source = $RepoUrl
        scope = $(if ($User) { 'user' } else { 'project' }); reinstall = $CmdHint
        installed_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        files = Get-FileMap $Dest
    }
    $json = $data | ConvertTo-Json -Depth 20
    [System.IO.File]::WriteAllText($Stamp, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
}

if ($Check) {
    if (-not (Test-Path $Dest)) {
        Write-Host "not installed: $Dest"
        Write-Host "  install with:  $CmdHint"
        exit 1
    }
    Write-Host "installed: $Dest"
    if (-not (Test-Path $Stamp)) {
        Write-Host '  no install stamp — installed before stamping.'
        Write-Host "  reinstall to start tracking:  $CmdHint"
        exit 0
    }
    $s = Get-Content -Raw $Stamp | ConvertFrom-Json
    Write-Host "  commit:    $($s.commit)"
    Write-Host "  installed: $($s.installed_at)"
    Write-Host "  source:    $($s.ref) @ $($s.source)"
    Write-Host "  available: $SrcCommit"
    if ($s.commit -eq $SrcCommit) { Info '  -> up to date' }
    else { Write-Host "  -> out of date; update with:  $($s.reinstall)" -ForegroundColor Yellow }
    $drift = Get-Drift
    if ($drift.Count) {
        Write-Host '  local edits (a reinstall moves these aside first):'
        $drift | ForEach-Object { Write-Host "    $_" }
    }
    if ($Tmp -and (Test-Path $Tmp)) { Remove-Item -Recurse -Force $Tmp }
    exit 0
}

# Copy the persona content into <confdir>\personas\<persona>. An existing
# install is removed only when it still matches its stamp; anything edited or
# unstamped is moved aside so no local work is lost.
if (Test-Path $Dest) {
    $drift = Get-Drift
    if ($drift.Count -or -not (Test-Path $Stamp)) {
        $backup = "$Dest.local-" + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
        if ($drift.Count) {
            Write-Host "-> local edits found under ${Dest}:" -ForegroundColor Yellow
            $drift | ForEach-Object { Write-Host "    $_" }
        }
        Move-Item $Dest $backup
        Info "-> moved aside to $backup (nothing discarded)"
    } else {
        Remove-Item -Recurse -Force $Dest
    }
}
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$copied = $false
foreach ($item in @('system', 'skills', 'settings.json', 'NOTICE')) {
    $p = Join-Path $Src $item
    if (Test-Path $p) { Copy-Item -Recurse -Force $p $Dest; $copied = $true }
}
if (-not $copied) { Fail "no persona content found in $Src" }
Write-Stamp
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
Write-Host "  Version:  $($SrcCommit.Substring(0, [Math]::Min(7, $SrcCommit.Length))) ($Ref)"
Write-Host ''
Write-Host "Start san in this directory; switch with  /persona $Persona  (or /persona default)."
Write-Host ''
Write-Host "Check for updates:  $CmdHint -Check"
Write-Host "Update:             $CmdHint"
