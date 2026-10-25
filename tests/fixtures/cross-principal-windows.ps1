param(
  [ValidateSet('prepare', 'probe')][string]$Action,
  [string]$Stage,
  [string]$Probe,
  [string]$Component
)
$ErrorActionPreference = 'Stop'
# A pwsh-hosted runner can otherwise hand Windows PowerShell incompatible PS7 modules.
$env:PSModulePath = Join-Path $PSHOME 'Modules'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:BRIDGE_CROSS_PRINCIPAL_TEST -ne '1') { throw 'ISOLATION_FRESH_CI_ONLY' }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ISOLATION_SETUP_PRIVILEGE_REQUIRED' }
$stagePath = [IO.Path]::GetFullPath($Stage)
$parent = [IO.Path]::GetFullPath($env:ProgramData).TrimEnd('\')
if ([IO.Path]::GetDirectoryName($stagePath) -ne $parent -or [IO.Path]::GetFileName($stagePath) -notmatch '^BridgeIsolation_[a-f0-9]{32}$') { throw 'ISOLATION_STAGE_REFUSED' }
$service = [Security.Principal.SecurityIdentifier]'S-1-5-19'
$system = [Security.Principal.SecurityIdentifier]'S-1-5-18'
function Set-FixtureAcl([string]$Path, [string]$ServiceRights, [bool]$Inherit) {
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetOwner($identity.User)
  $acl.SetAccessRuleProtection($true, $false)
  $both = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
  foreach ($sid in @($identity.User, $system)) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', $both, 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  $flags = if ($Inherit) { $both } else { [Security.AccessControl.InheritanceFlags]::None }
  $rule = New-Object Security.AccessControl.FileSystemAccessRule($service, $ServiceRights, $flags, 'None', 'Allow')
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $Path -AclObject $acl
}
if ($Action -eq 'prepare') {
  if (Test-Path -LiteralPath $stagePath) { throw 'ISOLATION_STAGE_EXISTS' }
  $source = Get-Item -LiteralPath $Probe
  if ($source.Name -ne 'fixture-cross-principal.exe' -or $source.Length -gt 16777216 -or ($source.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'ISOLATION_PROBE_REFUSED' }
  New-Item -ItemType Directory -Path $stagePath | Out-Null
  Set-FixtureAcl $stagePath 'ReadAndExecute' $true
  Copy-Item -LiteralPath $source.FullName -Destination (Join-Path $stagePath $source.Name)
  foreach ($name in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
    $library = Join-Path $source.DirectoryName $name
    if (Test-Path -LiteralPath $library) { Copy-Item -LiteralPath $library -Destination (Join-Path $stagePath $name) }
  }
  $runtime = Join-Path $stagePath 'runtime'
  New-Item -ItemType Directory -Path $runtime | Out-Null
  # The foreign account can list the root: denials must come from private sessions.
  Set-FixtureAcl $runtime 'ReadAndExecute' $false
  $reports = Join-Path $stagePath 'reports'
  New-Item -ItemType Directory -Path $reports | Out-Null
  Set-FixtureAcl $reports 'Modify' $true
  Write-Output 'ISOLATION_STAGE_READY'
  exit 0
}
if ($Component -notmatch '^worker-[a-f0-9]{32}-1-[a-f0-9]{32}$') { throw 'ISOLATION_COMPONENT_REFUSED' }
foreach ($path in @($stagePath, (Join-Path $stagePath 'runtime'), (Join-Path $stagePath 'reports'))) {
  $entry = Get-Item -LiteralPath $path
  if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'ISOLATION_STAGE_CHANGED' }
}
$taskName = 'BridgeIsolation_' + [Guid]::NewGuid().ToString('N')
$receipt = Join-Path $stagePath ('reports\' + $taskName + '.bin')
$executable = Join-Path $stagePath 'fixture-cross-principal.exe'
$arguments = '--probe "' + (Join-Path $stagePath 'runtime') + '" "' + $Component + '" "' + $receipt + '"'
$registered = $false
try {
  $taskAction = New-ScheduledTaskAction -Execute $executable -Argument $arguments
  $principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 20)
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Principal $principal -Settings $settings | Out-Null
  $registered = $true
  Start-ScheduledTask -TaskName $taskName
  $due = [DateTime]::UtcNow.AddSeconds(25)
  do {
    $state = (Get-ScheduledTask -TaskName $taskName).State
    $info = Get-ScheduledTaskInfo -TaskName $taskName
    if ($state -eq 'Ready' -and $info.LastRunTime.Year -gt 2000 -and $info.LastTaskResult -ne 267009) { break }
    Start-Sleep -Milliseconds 50
  } while ([DateTime]::UtcNow -lt $due)
  if ($state -eq 'Running' -or $info.LastRunTime.Year -le 2000 -or $info.LastTaskResult -ne 0) { throw 'ISOLATION_FOREIGN_PROBE_FAILED' }
  $entry = Get-Item -LiteralPath $receipt
  if ($entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'ISOLATION_RECEIPT_REFUSED' }
  $stream = [IO.File]::Open($receipt, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    if ($stream.Length -ne 8) { throw 'ISOLATION_RECEIPT_REFUSED' }
    $bytes = New-Object byte[] 8
    $used = 0
    while ($used -lt 8) {
      $count = $stream.Read($bytes, $used, 8 - $used)
      if ($count -eq 0) { throw 'ISOLATION_RECEIPT_REFUSED' }
      $used += $count
    }
    if ($stream.ReadByte() -ne -1) { throw 'ISOLATION_RECEIPT_REFUSED' }
  } finally { $stream.Dispose() }
  if ($bytes.Length -ne 8 -or [BitConverter]::ToUInt32($bytes, 0) -ne 1 -or [BitConverter]::ToUInt32($bytes, 4) -ne 255) { throw 'ISOLATION_RECEIPT_REFUSED' }
  Write-Output '{"v":1,"checks":255}'
} finally {
  if ($registered) {
    Stop-ScheduledTask -TaskName $taskName
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
}
