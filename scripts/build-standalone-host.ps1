param()

$ErrorActionPreference = 'Stop'
$workspacePath = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$availableLetter = @('R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z') | Where-Object {
  !(Test-Path -LiteralPath ($_ + ':\'))
} | Select-Object -First 1
if (!$availableLetter) { throw 'No free drive letter for the standalone host build alias' }
$driveName = $availableLetter + ':'
& subst.exe $driveName $workspacePath
if ($LASTEXITCODE -ne 0) { throw 'Cannot create standalone workspace alias' }
try {
  $vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  $visualStudioPath = & $vswherePath -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  if (!$visualStudioPath) { throw 'Visual Studio x64 C++ build tools are absent' }
  $nativeGitDirectory = Split-Path -Parent (Get-Command git.exe -CommandType Application -ErrorAction Stop).Source
  & cmd.exe /d /c ('call "' + $driveName + '\scripts\msvc-env.cmd" "' + $visualStudioPath + '" "' + $nativeGitDirectory + '" && cmake -S "' + $driveName + '\packaging\standalone\windows" -B "' + $driveName + '\build\standalone-host" -G Ninja -DCMAKE_BUILD_TYPE=Release && cmake --build "' + $driveName + '\build\standalone-host"')
  $nativeExitCode = $LASTEXITCODE
} finally {
  & subst.exe $driveName /d
}
exit $nativeExitCode
