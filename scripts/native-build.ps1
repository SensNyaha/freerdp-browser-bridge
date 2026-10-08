param([ValidateSet('dependencies', 'freerdp', 'bundled')][string]$Task = 'dependencies')

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
  $compilerEnvironmentPath = $driveName + '\scripts\msvc-env.cmd'
  $nodePath = $driveName + '\.tools\node-v24.21.0-win-x64\node.exe'
  $scriptPath = $driveName + '\scripts\build-' + $Task + '.mjs'
  & cmd.exe /d /c ('call "' + $compilerEnvironmentPath + '" "' + $visualStudioPath + '" && "' + $nodePath + '" "' + $scriptPath + '"')
  $nativeExitCode = $LASTEXITCODE
} finally {
  Set-Location -LiteralPath $previousLocation.Path
  & subst.exe $driveName /d
}
exit $nativeExitCode
