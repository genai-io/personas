# San persona uninstaller for Windows (PowerShell 5.1+)
#
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/genai-io/personas/main/uninstall.ps1))) -Persona codex
#   & ([scriptblock]::Create((irm .../uninstall.ps1))) -Persona codex -User
#
# Default scope is the current project (<cwd>\.san).

param(
    [Parameter(Mandatory = $true)]
    [string]$Persona,
    [switch]$User,
    [string]$Dir = '.'
)

$ErrorActionPreference = 'Stop'

function Info($m) { Write-Host $m -ForegroundColor Green }

if ($User) {
    $ConfDir = Join-Path $HOME '.san'
} else {
    $ConfDir = Join-Path ((Resolve-Path $Dir).Path) '.san'
}

$Dest = Join-Path (Join-Path $ConfDir 'personas') $Persona
if (Test-Path $Dest) {
    Remove-Item -Recurse -Force $Dest
    Info "-> removed $Dest"
} else {
    Info "-> no persona dir at $Dest (skipping)"
}

# Disable: drop "persona" from settings.json only if it points at this persona.
$Settings = Join-Path $ConfDir 'settings.json'
if (Test-Path $Settings) {
    try { $data = Get-Content -Raw $Settings | ConvertFrom-Json } catch { $data = $null }
    if ($data -and ($data.PSObject.Properties.Name -contains 'persona') -and ($data.persona -eq $Persona)) {
        $data.PSObject.Properties.Remove('persona')
        if (@($data.PSObject.Properties).Count -eq 0) {
            $json = '{}'
        } else {
            $json = $data | ConvertTo-Json -Depth 20
        }
        # UTF-8 without BOM (Go's JSON parser rejects a BOM).
        [System.IO.File]::WriteAllText($Settings, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
        Info "-> disabled persona in $Settings"
    }
}

Write-Host ''
Info "[OK] $Persona uninstalled"
