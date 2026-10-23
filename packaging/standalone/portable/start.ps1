param(
  [string]$Configuration = '',
  [string]$RuntimeRoot = ''
)
$ErrorActionPreference = 'Stop'
# PowerShell 5 otherwise treats an .exe as a document when PATHEXT is absent.
# Resolve only the fixed packaged executables, including in a clean environment.
$env:PATHEXT = '.EXE'
$failure = 'PATHS'
try {
  if (!$Configuration) { $Configuration = Join-Path $PSScriptRoot 'config\bridge.json' }
  if (!$RuntimeRoot) {
    $localData = [Environment]::GetFolderPath('LocalApplicationData')
    if (!$localData) { throw 'Portable runtime parent unavailable' }
    $parent = Join-Path $localData 'FreeRDPBridge'
    [void][IO.Directory]::CreateDirectory($parent)
    $RuntimeRoot = Join-Path $parent 'portable-runtime'
  }
  foreach ($path in @($Configuration, $RuntimeRoot)) {
    if (![IO.Path]::IsPathRooted($path) -or $path.StartsWith('\\')) { throw 'Local absolute paths required' }
  }
  if (!(Test-Path -LiteralPath $RuntimeRoot)) {
    $failure = 'RUNTIME_CREATE'
    $helper = Join-Path $PSScriptRoot 'service\node_modules\@freerdp-bridge\runtime-win32-x64\runtime\bin\rdp-runtime-directory.exe'
    $failure = 'RUNTIME_HELPER'
    $receiptText = & $helper --create-private-directory $RuntimeRoot
    $failure = 'RUNTIME_HELPER_EXIT'
    if ($LASTEXITCODE -ne 0) { throw 'Private runtime creation failed' }
    $failure = 'RUNTIME_RECEIPT'
    $receipt = $receiptText | ConvertFrom-Json -ErrorAction Stop
    if ($receipt.v -ne 1 -or $receipt.created -ne $true -or $receipt.error -ne 0) { throw 'Private runtime receipt invalid' }
  }
  $failure = 'RUNTIME_ACCESS'
  $directory = Get-Item -LiteralPath $RuntimeRoot -Force
  if (!$directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Private runtime directory required' }
  $acl = Get-Acl -LiteralPath $RuntimeRoot
  $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if (!$acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $owner) { throw 'Private runtime ownership required' }
  foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow -and $rule.IdentityReference.Value -notin @($owner, 'S-1-5-18', 'S-1-5-32-544')) { throw 'Private runtime access required' }
  }
  $failure = 'HOST_LAUNCH'
  & (Join-Path $PSScriptRoot 'bridge-service.exe') --console --config ([IO.Path]::GetFullPath($Configuration)) --runtime-root ([IO.Path]::GetFullPath($RuntimeRoot))
  exit $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine('STANDALONE_PORTABLE_' + $failure + '_FAILED')
  exit 1
}
