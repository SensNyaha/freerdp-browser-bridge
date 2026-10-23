param(
  [Parameter(Mandatory=$true)][string]$RootPath,
  [Parameter(Mandatory=$true)][string]$ArchivePath
)
$ErrorActionPreference='Stop'
$env:PATHEXT='.EXE'
# Use the system's archive tool to retain all inventoried dot-prefixed npm files.
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
& $tar -a -cf $ArchivePath -C (Split-Path -Parent $RootPath) (Split-Path -Leaf $RootPath)
exit $LASTEXITCODE
