param([ValidateSet('foundation', 'clean-foundation', 'dependencies', 'freerdp', 'bundled')][string]$Task = 'dependencies')

$workspacePath = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$availableLetter = @('R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z') | Where-Object {
  !(Test-Path -LiteralPath ($_ + ':\'))
} | Select-Object -First 1
if (!$availableLetter) { throw 'No free drive letter for temporary native build workspace alias' }
$driveName = $availableLetter + ':'
& subst.exe $driveName $workspacePath
if ($LASTEXITCODE -ne 0) { throw 'Cannot create temporary workspace alias' }
$previousLocation = Get-Location
try {
  Set-Location -LiteralPath ($driveName + '\')
  $vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  $visualStudioPath = & $vswherePath -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if (!$visualStudioPath) { throw 'Visual Studio x64 C++ build tools are absent' }
  $nativeGitDirectory = Split-Path -Parent (Get-Command git.exe -CommandType Application -ErrorAction Stop).Source
  $compilerEnvironmentPath = $driveName + '\scripts\msvc-env.cmd'
  if ($Task -eq 'foundation') {
    # Preset sourceDir can expand to the canonical non-ASCII path. Keep Catch2's
    # absolute object paths out of MSVC's UTF-8 response files using this alias.
    $fetchContentPath = $driveName + '/build/foundation/_deps'
    & cmd.exe /d /c ('call "' + $compilerEnvironmentPath + '" "' + $visualStudioPath + '" "' + $nativeGitDirectory + '" && cmake --preset foundation -DFETCHCONTENT_BASE_DIR="' + $fetchContentPath + '" && cmake --build --preset foundation --parallel 8 && ctest --preset foundation')
  } elseif ($Task -eq 'clean-foundation') {
    $catchSourcePath = $driveName + '\build\foundation\_deps\catch2-src'
    if (!(Test-Path -LiteralPath (Join-Path $catchSourcePath 'src\catch2\catch_version_macros.hpp'))) {
      throw 'Prepare the ordinary foundation/Catch2 source before the offline clean check'
    }
    $nodePath = $driveName + '\.tools\node-v24.21.0-win-x64\node.exe'
    $scriptPath = $driveName + '\scripts\test-native-clean-build.mjs'
    & cmd.exe /d /c ('call "' + $compilerEnvironmentPath + '" "' + $visualStudioPath + '" "' + $nativeGitDirectory + '" && "' + $nodePath + '" "' + $scriptPath + '" "' + $catchSourcePath + '"')
  } else {
    $nodePath = $driveName + '\.tools\node-v24.21.0-win-x64\node.exe'
    $scriptPath = $driveName + '\scripts\build-' + $Task + '.mjs'
    & cmd.exe /d /c ('call "' + $compilerEnvironmentPath + '" "' + $visualStudioPath + '" "' + $nativeGitDirectory + '" && "' + $nodePath + '" "' + $scriptPath + '"')
  }
  $nativeExitCode = $LASTEXITCODE
} finally {
  Set-Location -LiteralPath $previousLocation.Path
  & subst.exe $driveName /d
}
exit $nativeExitCode
