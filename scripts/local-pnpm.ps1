param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArguments = @('check'))

$workspacePath = Split-Path -Parent $PSScriptRoot
$nodeDirectory = Join-Path $workspacePath '.tools\node-v24.21.0-win-x64'
$pnpmDirectory = Join-Path $workspacePath '.tools\node_modules\.bin'
$nodeExecutable = Join-Path $nodeDirectory 'node.exe'
$pnpmScript = Join-Path $workspacePath '.tools\node_modules\pnpm\bin\pnpm.cjs'
if (!(Test-Path -LiteralPath $nodeExecutable) -or !(Test-Path -LiteralPath $pnpmScript)) {
  throw 'Local toolchain is absent. Install Node.js 24 and pnpm 10.11.0 as described in docs/DEVELOPMENT.md.'
}
$previousPath = $env:PATH
Push-Location -LiteralPath $workspacePath
try {
  $env:PATH = $nodeDirectory + ';' + $pnpmDirectory + ';' + $previousPath
  & $nodeExecutable --use-system-ca $pnpmScript @PnpmArguments
  $pnpmExitCode = $LASTEXITCODE
} finally {
  $env:PATH = $previousPath
  Pop-Location
}
exit $pnpmExitCode
