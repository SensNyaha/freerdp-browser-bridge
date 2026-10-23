param(
  [ValidateSet('foundation', 'clean-foundation', 'clean-bundled', 'clean-bundled-debug', 'clean-freerdp', 'clean-freerdp-debug', 'clean-dependencies', 'dependencies', 'freerdp', 'bundled')][string]$Task = 'dependencies',
  [string]$RebuiltSdkReceipt = '',
  [string]$DependencyReceipt = ''
)

if ($RebuiltSdkReceipt -and ($Task -notin @('clean-bundled', 'clean-bundled-debug') -or $RebuiltSdkReceipt -notmatch '^build[\\/]freerdp-source-clean-[A-Za-z0-9_-]+[\\/]receipt\.json$')) {
  throw 'A rebuilt SDK receipt must name an isolated build/freerdp-source-clean-*/receipt.json and use clean-bundled or clean-bundled-debug'
}
if ($Task -eq 'clean-bundled-debug' -and !$RebuiltSdkReceipt) {
  throw 'Linked Debug requires a rebuilt SDK receipt'
}
if ($DependencyReceipt -and ($Task -notin @('clean-freerdp', 'clean-freerdp-debug') -or $DependencyReceipt -notmatch '^build[\\/]dependencies-source-clean-[A-Za-z0-9_-]+[\\/]installed[\\/]bridge-dependency-build\.json$')) {
  throw 'A source dependency receipt must name an isolated build/dependencies-source-clean-*/installed/bridge-dependency-build.json and use clean-freerdp or clean-freerdp-debug'
}

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
  } elseif ($Task -in @('clean-foundation', 'clean-bundled', 'clean-bundled-debug')) {
    $cleanBuildBase = if ($Task -eq 'clean-foundation') { 'foundation' } else { 'bundled' }
    $cleanBuildMode = if ($Task -eq 'clean-foundation') { 'foundation' } elseif ($Task -eq 'clean-bundled-debug') { 'linked-debug' } else { 'linked' }
    $catchSourcePath = $driveName + '\build\' + $cleanBuildBase + '\_deps\catch2-src'
    if (!(Test-Path -LiteralPath (Join-Path $catchSourcePath 'src\catch2\catch_version_macros.hpp'))) {
      throw 'Prepare the corresponding ordinary build/Catch2 source before the offline clean check'
    }
    $nodePath = $driveName + '\.tools\node-v24.21.0-win-x64\node.exe'
    $scriptPath = $driveName + '\scripts\test-native-clean-build.mjs'
    $sdkReceiptArgument = if ($RebuiltSdkReceipt) { ' "' + $driveName + '\' + ($RebuiltSdkReceipt -replace '/', '\') + '"' } else { '' }
    & cmd.exe /d /c ('call "' + $compilerEnvironmentPath + '" "' + $visualStudioPath + '" "' + $nativeGitDirectory + '" && "' + $nodePath + '" "' + $scriptPath + '" "' + $catchSourcePath + '" ' + $cleanBuildMode + $sdkReceiptArgument)
  } elseif ($Task -in @('clean-freerdp', 'clean-freerdp-debug', 'clean-dependencies')) {
    $nodePath = $driveName + '\.tools\node-v24.21.0-win-x64\node.exe'
    $cleanScript = if ($Task -eq 'clean-dependencies') { 'dependencies' } else { 'freerdp' }
    $cleanSdkMode = if ($Task -eq 'clean-freerdp-debug') { '--clean-debug' } else { '--clean-local' }
    $scriptPath = $driveName + '\scripts\build-' + $cleanScript + '.mjs'
    $dependencyReceiptArgument = if ($DependencyReceipt) { ' "' + $driveName + '\' + ($DependencyReceipt -replace '/', '\') + '"' } else { '' }
    & cmd.exe /d /c ('call "' + $compilerEnvironmentPath + '" "' + $visualStudioPath + '" "' + $nativeGitDirectory + '" && "' + $nodePath + '" "' + $scriptPath + '" ' + $cleanSdkMode + $dependencyReceiptArgument)
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
