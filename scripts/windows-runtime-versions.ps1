param([Parameter(Mandatory = $true)][string]$Directory)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
  $project = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
  $build = (Resolve-Path -LiteralPath (Join-Path $project 'build')).Path
  $directoryPath = (Resolve-Path -LiteralPath $Directory).Path
  if (!$directoryPath.StartsWith($build + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Invalid input'
  }
  $names = @('concrt140.dll', 'msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'msvcp140_atomic_wait.dll', 'msvcp140_codecvt_ids.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')
  $records = foreach ($name in $names) {
    $file = Get-Item -LiteralPath (Join-Path $directoryPath $name)
    if ($file.PSIsContainer -or ($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { throw 'Invalid input' }
    $version = $file.VersionInfo
    [pscustomobject]@{
      name = $name
      version = @($version.FileMajorPart, $version.FileMinorPart, $version.FileBuildPart, $version.FilePrivatePart) -join '.'
    }
  }
  ConvertTo-Json -InputObject @($records) -Compress
} catch {
  [Console]::Error.WriteLine('WINDOWS_RUNTIME_VERSION_INVALID')
  exit 1
}
