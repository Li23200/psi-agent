[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MsysDir,
    [Parameter(Mandatory = $true)]
    [string]$Fingerprint,
    [Parameter(Mandatory = $true)]
    [string]$OutputDir
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $MsysDir).Path.TrimEnd('\', '/')
$versionFile = Join-Path $root 'msys-version.txt'
[System.IO.File]::WriteAllText(
    $versionFile,
    $Fingerprint + "`r`n",
    [System.Text.UTF8Encoding]::new($false)
)

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$archive = Join-Path (Resolve-Path -LiteralPath $OutputDir).Path ("msys64-" + $Fingerprint + ".zip")

$parent = Split-Path -Parent $root
$leaf = Split-Path -Leaf $root
$tarOk = $false
Push-Location $parent
try {
    & tar.exe -a -c -f $archive $leaf
    if ($LASTEXITCODE -ne 0) {
        throw "tar zip failed with exit code $LASTEXITCODE"
    }
    $tarOk = $true
} catch {
    Write-Warning "tar failed: $_; falling back to Compress-Archive"
} finally {
    Pop-Location
}

if (-not $tarOk) {
    if (Test-Path -LiteralPath $archive) {
        Remove-Item -LiteralPath $archive -Force
    }
    Compress-Archive -Path $root -DestinationPath $archive -CompressionLevel Optimal
}

Write-Output $archive
