param([string]$RunId, [switch]$DiskFull)
$ErrorActionPreference = 'Stop'
if ($RunId -cnotmatch '^[0-9a-f]{32}$') { throw 'OWNED_ID' }
$rw = '\\tsclient\RW' + $RunId.Substring(0, 5)
$ro = '\\tsclient\RO' + $RunId.Substring(0, 5)
$phase = 'mount'
function Get-OwnedPattern {
  $bytes = [byte[]]::new(131111)
  for ($i = 0; $i -lt $bytes.Length; $i++) { $bytes[$i] = [byte](($i * 31 + 17) -band 255) }
  return ,$bytes
}
function Get-OwnedHash([byte[]]$Bytes) {
  $hash = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hash.ComputeHash($Bytes)).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose() }
}
function Read-Owned([string]$Path, [int]$Maximum) {
  if ($Maximum -lt 1 -or $Maximum -gt 131111) { throw 'OWNED_BOUND' }
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    if ($stream.Length -gt $Maximum) { throw 'OWNED_BOUND' }
    $buffer = [byte[]]::new($Maximum + 1)
    $count = 0
    while ($count -lt $buffer.Length) {
      $n = $stream.Read($buffer, $count, $buffer.Length - $count)
      if ($n -eq 0) { break }
      $count += $n
    }
    if ($count -gt $Maximum) { throw 'OWNED_BOUND' }
    $result = [byte[]]::new($count)
    [Array]::Copy($buffer, $result, $count)
    [Array]::Clear($buffer, 0, $buffer.Length)
    return ,$result
  } finally { $stream.Dispose() }
}
function Assert-OwnedCommand([object]$Command, [string]$ExpectedId, [ValidateSet('cleanup', 'resume-after-full')][string]$ExpectedCommand = 'cleanup') {
  $keys = ($Command.PSObject.Properties.Name | Sort-Object) -join ','
  if ($keys -cne 'command,id' -or $Command.id -cne $ExpectedId -or $Command.command -cne $ExpectedCommand) { throw 'OWNED_COMMAND' }
}
function Assert-OwnedDenied([scriptblock]$Operation) {
  try { & $Operation }
  catch {
    $cause = $_.Exception
    while ($cause.InnerException) { $cause = $cause.InnerException }
    if (($cause.HResult -band 65535) -in @(5, 19)) { return }
    throw [InvalidOperationException]::new('OWNED_WRONG_REFUSAL', $cause)
  }
  throw 'OWNED_WRITE_ALLOWED'
}
function Write-OwnedReservedReceipt([ValidateSet('receipt-full.json', 'receipt-failed.json')][string]$Name, [hashtable]$Value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 3 -Compress))
  if ($bytes.Length -gt 2048) { throw 'OWNED_BOUND' }
  $padded = [byte[]]::new(2048)
  for ($i = 0; $i -lt 2048; $i++) { $padded[$i] = 32 }
  [Array]::Copy($bytes, $padded, $bytes.Length)
  # HTTP may briefly hold a read pin on the preallocated receipt. Retry only
  # sharing/lock refusal within a separate fixed lab-publication deadline.
  $openClock = [Diagnostics.Stopwatch]::StartNew()
  while ($true) {
    try {
      $stream = [IO.File]::Open((Join-Path $rw $Name), [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::None)
      break
    } catch {
      $cause = $_.Exception
      while ($cause.InnerException) { $cause = $cause.InnerException }
      if (($cause.HResult -band 65535) -notin @(32, 33)) { throw }
      if ($openClock.ElapsedMilliseconds -ge 2000) { throw 'OWNED_RECEIPT_BUSY' }
      Start-Sleep -Milliseconds 10
    }
  }
  try {
    if ($stream.Length -ne 2048) { throw 'OWNED_RESERVED_RECEIPT' }
    $stream.Write($padded, 0, 2048); $stream.Flush()
  } finally {
    $stream.Dispose()
    [Array]::Clear($bytes, 0, $bytes.Length)
    [Array]::Clear($padded, 0, $padded.Length)
  }
}
function Write-OwnedReceipt([ValidateSet('receipt-created.json', 'receipt-clean.json', 'receipt-failed.json')][string]$Name, [hashtable]$Value) {
  if ($DiskFull -and $Name -ceq 'receipt-failed.json' -and [IO.File]::Exists((Join-Path $rw $Name))) {
    Write-OwnedReservedReceipt $Name $Value
    return
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 3 -Compress))
  if ($bytes.Length -gt 2048) { throw 'OWNED_BOUND' }
  $stream = [IO.File]::Open((Join-Path $rw $Name), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() }
  finally { $stream.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
}
try {
  if ($env:OS -ne 'Windows_NT') { throw 'OWNED_PLATFORM' }
  $mountClock = [Diagnostics.Stopwatch]::StartNew()
  while (-not [IO.Directory]::Exists($rw) -or -not [IO.Directory]::Exists($ro)) {
    if ($mountClock.ElapsedMilliseconds -gt 20000) { throw 'OWNED_MOUNT' }
    Start-Sleep -Milliseconds 200
  }
  $seedA = Read-Owned (Join-Path $rw 'seed.bin') 512
  $seedB = Read-Owned (Join-Path $ro 'seed.bin') 512
  if ($seedA.Length -eq 0 -or (Get-OwnedHash $seedA) -ne (Get-OwnedHash $seedB)) { throw 'OWNED_SEED' }
  $phase = 'read-only-create'
  Assert-OwnedDenied { $s = [IO.File]::Open((Join-Path $ro 'forbidden.bin'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None); $s.Dispose() }
  $phase = 'read-only-open'
  Assert-OwnedDenied { $s = [IO.File]::Open((Join-Path $ro 'seed.bin'), [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None); $s.Dispose() }
  $phase = 'read-only-delete'
  Assert-OwnedDenied { [IO.File]::Delete((Join-Path $ro 'seed.bin')) }
  if ($DiskFull) {
    $phase = 'receipt-reserve'
    $padding = [byte[]]::new(2048)
    for ($i = 0; $i -lt $padding.Length; $i++) { $padding[$i] = 32 }
    foreach ($name in @('receipt-full.json', 'receipt-failed.json')) {
      $reserve = [IO.File]::Open((Join-Path $rw $name), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
      try { $reserve.Write($padding, 0, $padding.Length); $reserve.Flush() }
      finally { $reserve.Dispose() }
    }
    [Array]::Clear($padding, 0, $padding.Length)
    $phase = 'disk-full'
    $fullPath = Join-Path $rw 'owned-resource-full.bin'
    $fullBlock = [byte[]]::new(65536)
    for ($i = 0; $i -lt $fullBlock.Length; $i++) { $fullBlock[$i] = [byte](($i * 17 + 83) -band 255) }
    $acknowledged = 0
    $fullError = 0
    $stream = [IO.File]::Open($fullPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try {
      while ($acknowledged -lt 2097152) {
        $stream.Write($fullBlock, 0, $fullBlock.Length)
        $acknowledged += $fullBlock.Length
      }
      $stream.Flush()
    } catch {
      $cause = $_.Exception
      while ($cause.InnerException) { $cause = $cause.InnerException }
      $fullError = $cause.HResult -band 65535
    } finally {
      $stream.Dispose()
      [Array]::Clear($fullBlock, 0, $fullBlock.Length)
    }
    if ($fullError -notin @(39, 112) -or $acknowledged -lt 65536 -or $acknowledged -ge 2097152) { throw 'OWNED_WRONG_FULL_REFUSAL' }
    Write-OwnedReservedReceipt 'receipt-full.json' @{ v=1; id=$RunId; phase='full'; ok=$true; errno=$fullError; acknowledgedBytes=$acknowledged }
    $phase = 'wait-full-host'
    $resume = Join-Path $rw 'continue-full.json'
    $clock = [Diagnostics.Stopwatch]::StartNew()
    while (-not [IO.File]::Exists($resume)) {
      if ($clock.ElapsedMilliseconds -gt 60000) { throw 'OWNED_DEADLINE' }
      Start-Sleep -Milliseconds 100
    }
    $command = [Text.Encoding]::UTF8.GetString((Read-Owned $resume 4096)) | ConvertFrom-Json
    Assert-OwnedCommand $command $RunId 'resume-after-full'
    if ([IO.File]::Exists($fullPath)) { throw 'OWNED_FULL_FILE_REMAINS' }
    foreach ($name in @('continue-full.json', 'receipt-full.json', 'receipt-failed.json')) { [IO.File]::Delete((Join-Path $rw $name)) }
  }
  $phase = 'create-write'
  $unicode = [string][char]0x0416 + [char]0x65e5 + [char]0x672c + [char]0x8a9e + [char]::ConvertFromUtf32(128512)
  $original = Join-Path $rw ('remote-' + $unicode + '.bin')
  $bytes = Get-OwnedPattern
  $stream = [IO.File]::Open($original, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush(); $stream.SetLength(65599) }
  finally { $stream.Dispose() }
  $phase = 'rename'
  $directory = Join-Path $rw 'nested'
  if ([IO.Directory]::Exists($directory)) { throw 'OWNED_EXISTING' }
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $renamed = Join-Path $directory ('renamed-' + $unicode + '.bin')
  [IO.File]::Move($original, $renamed)
  $actual = Read-Owned $renamed 65599
  $prefix = [byte[]]::new(65599)
  [Array]::Copy($bytes, $prefix, $prefix.Length)
  if ($actual.Length -ne 65599 -or (Get-OwnedHash $actual) -ne (Get-OwnedHash $prefix)) { throw 'OWNED_BYTES' }
  if ([IO.Directory]::GetFileSystemEntries($directory).Length -ne 1) { throw 'OWNED_ENTRIES' }
  Write-OwnedReceipt 'receipt-created.json' @{ v = 1; id = $RunId; phase = 'created'; ok = $true; bytes = 65599; readOnlyRefusals = 3; sha256 = (Get-OwnedHash $actual) }
  $phase = 'wait-host'
  $clock = [Diagnostics.Stopwatch]::StartNew()
  $continue = Join-Path $rw 'continue.json'
  while (-not [IO.File]::Exists($continue)) {
    if ($clock.ElapsedMilliseconds -gt 60000) { throw 'OWNED_DEADLINE' }
    Start-Sleep -Milliseconds 100
  }
  $command = [Text.Encoding]::UTF8.GetString((Read-Owned $continue 4096)) | ConvertFrom-Json
  Assert-OwnedCommand $command $RunId
  $phase = 'host-readback'
  $hostFile = Join-Path $rw 'node-new.bin'
  $hostBytes = Read-Owned $hostFile 131111
  if ($hostBytes.Length -ne 131111 -or (Get-OwnedHash $hostBytes) -ne (Get-OwnedHash $bytes)) { throw 'OWNED_BYTES' }
  $phase = 'delete'
  [IO.File]::Delete($renamed)
  [IO.Directory]::Delete($directory, $false)
  foreach ($name in @('seed.bin', 'node-new.bin', 'receipt-created.json', 'continue.json', 'owned-check.ps1')) { [IO.File]::Delete((Join-Path $rw $name)) }
  if ([IO.Directory]::GetFileSystemEntries($rw).Length -ne 0) { throw 'OWNED_ENTRIES' }
  if ((Get-OwnedHash (Read-Owned (Join-Path $ro 'seed.bin') 512)) -ne (Get-OwnedHash $seedB)) { throw 'OWNED_SEED' }
  Write-OwnedReceipt 'receipt-clean.json' @{ v = 1; id = $RunId; phase = 'clean'; ok = $true; hostUploadBytes = 131111; readOnlySeedIntact = $true }
  Write-Output 'OWNED_MANAGED_FILES_CHECK_DONE'
} catch {
  $cause = $_.Exception
  while ($cause.InnerException) { $cause = $cause.InnerException }
  try { Write-OwnedReceipt 'receipt-failed.json' @{ v = 1; id = $RunId; phase = $phase; ok = $false; errno = ($cause.HResult -band 65535) } } catch { }
  Write-Output 'OWNED_MANAGED_FILES_CHECK_FAILED'
} finally {
  foreach ($array in @($bytes, $prefix, $actual, $seedA, $seedB, $hostBytes, $padding, $fullBlock)) { if ($array) { [Array]::Clear($array, 0, $array.Length) } }
}
