param([Parameter(Mandatory=$true)][string]$ImageDirectory)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Require([bool]$Condition) { if (-not $Condition) { throw 'OWNED_VHD_ADMISSION_CONTROL_FAILED' } }
function Sha256([string]$Path) {
    $hash = New-Object Security.Cryptography.SHA256Managed
    $file = [IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($hash.ComputeHash($file)).Replace('-','').ToLowerInvariant() }
    finally { $file.Dispose(); $hash.Dispose() }
}
$checker = Join-Path $PSScriptRoot 'windows-owned-full-volume.ps1'
$source = (Resolve-Path -LiteralPath $ImageDirectory).Path
$json = [IO.File]::ReadAllText((Join-Path $source 'volume.json'))
$meta = $json | ConvertFrom-Json
$good = (& $checker -ImageDirectory $source -InspectOnly -InspectionDiagnostics) | ConvertFrom-Json
Require ($good.inspected -and -not $good.mounted -and $good.sha256 -ceq $meta.sha256)
$build = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../build'))
$root = Join-Path $build ('owned-vhd-guard-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$image = Join-Path $root 'owned-full.vhd'
$manifest = Join-Path $root 'volume.json'
function Reject($Record) {
    [IO.File]::WriteAllText($manifest,($Record | ConvertTo-Json -Compress))
    $refused = $false
    try { $null = & $checker -ImageDirectory $root -InspectOnly -InspectionDiagnostics }
    catch {
        Require ($_.Exception.Message -ceq 'OWNED_VHD_REFUSED')
        $refused = $true
    }
    Require $refused
}
try {
    [IO.File]::Copy((Join-Path $source 'owned-full.vhd'),$image,$false)
    for ($n=0; $n -lt 3; $n++) {
        $record = $json | ConvertFrom-Json
        switch ($n) {
            0 { $record.sourceDeviceOpened = $true }
            1 { $record.diskBytes = 33554432 }
            2 { $record.sha256 = '0'*64 }
        }
        Reject $record
    }
    $file = [IO.File]::Open($image,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
        [void]$file.Seek(-1,[IO.SeekOrigin]::End)
        $byte = $file.ReadByte()
        [void]$file.Seek(-1,[IO.SeekOrigin]::End)
        $file.WriteByte($byte -bxor 1)
    } finally { $file.Dispose() }
    $record = $json | ConvertFrom-Json
    $record.sha256 = Sha256 $image
    Require ($record.sha256 -cne $meta.sha256)
    Reject $record
    Require ((Sha256 (Join-Path $source 'owned-full.vhd')) -ceq $meta.sha256)
    Require (@(Get-ChildItem -LiteralPath $root -Force).Count -eq 2)
} finally {
    Require ([IO.Path]::GetDirectoryName($root) -ceq $build)
    Require ([IO.Path]::GetFileName($root) -cmatch '^owned-vhd-guard-[0-9a-f]{32}$')
    Require (-not ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint))
    foreach ($path in @($image,$manifest)) {
        if ([IO.File]::Exists($path)) {
            Require (-not ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint))
            [IO.File]::Delete($path)
        }
    }
    [IO.Directory]::Delete($root,$false)
}
@{ inspected=$true; mounted=$false; provenanceRefusals=3; corruptFooterRefused=$true;
   sourcePreserved=$true; guardRemoved=$true; sha256=$meta.sha256 } | ConvertTo-Json -Compress
