param(
    [Parameter(Mandatory=$true)][string]$ImageDirectory,
    [string]$NodeExecutable = 'node',
    [string]$BinaryDirectory = 'build/foundation',
    [switch]$InspectOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Storage identity APIs: https://learn.microsoft.com/powershell/module/storage/get-diskimage
# This coordinator mounts only a new private copy of the offline 16 MiB fixture.
# It never initializes or formats a Windows disk.
function Require([bool]$Condition) {
    if (-not $Condition) { throw 'OWNED_VHD_REFUSED' }
}
function Read-At($Stream, [long]$Offset, [int]$Count) {
    [void]$Stream.Seek($Offset, [IO.SeekOrigin]::Begin)
    $bytes = New-Object byte[] $Count
    Require ($Stream.Read($bytes, 0, $Count) -eq $Count)
    return ,$bytes
}
function Big-Number($Bytes, [int]$Offset, [int]$Count) {
    [UInt64]$value = 0
    for ($i=0; $i -lt $Count; $i++) { $value = ($value -shl 8) -bor $Bytes[$Offset+$i] }
    return $value
}
function Hex($Bytes) { return [BitConverter]::ToString($Bytes).Replace('-', '').ToLowerInvariant() }
function Assert-Disk($Disk, $Before, [UInt32]$Signature) {
    Require ($Disk.Size -eq 16777216 -and -not $Disk.IsBoot -and -not $Disk.IsSystem)
    Require ($Disk.PartitionStyle -eq 'MBR' -and $Disk.Signature -eq $Signature)
    Require (-not $Disk.IsReadOnly -and -not $Disk.IsOffline)
    Require ($Disk.ObjectId -notin $Before)
}
$build = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../build'))
$directory = (Resolve-Path -LiteralPath $ImageDirectory).Path.TrimEnd('\')
Require ($directory.StartsWith($build+'\', [StringComparison]::OrdinalIgnoreCase))
$walk = $directory
while ($walk.Length -ge $build.Length) {
    Require (-not ((Get-Item -LiteralPath $walk).Attributes -band [IO.FileAttributes]::ReparsePoint))
    if ($walk -eq $build) { break }
    $walk = [IO.Path]::GetDirectoryName($walk)
}
$manifestPath = Join-Path $directory 'volume.json'
$imagePath = Join-Path $directory 'owned-full.vhd'
$manifestFile = Get-Item -LiteralPath $manifestPath
$imageFile = Get-Item -LiteralPath $imagePath
Require (-not ($manifestFile.Attributes -band [IO.FileAttributes]::ReparsePoint))
Require (-not ($imageFile.Attributes -band [IO.FileAttributes]::ReparsePoint))
Require ($manifestFile.Length -gt 0 -and $manifestFile.Length -le 8192 -and $imageFile.Length -eq 16777728)
$meta = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
Require ((@($meta.PSObject.Properties.Name | Sort-Object) -join ',') -ceq
    'diskBytes,fileBytes,hostMountPerformed,kind,ntfsSerial,partitionSectors,partitionStartSector,rawRoundtripSha256,schema,sha256,sourceDeviceOpened,vhdIdentifier')
foreach ($key in @('schema','diskBytes','fileBytes','partitionStartSector','partitionSectors')) {
    Require ($meta.$key -is [int])
}
foreach ($key in @('kind','ntfsSerial','sha256','rawRoundtripSha256','vhdIdentifier')) {
    Require ($meta.$key -is [string])
}
Require ($meta.sourceDeviceOpened -is [bool] -and $meta.hostMountPerformed -is [bool])
Require ($meta.ntfsSerial -cmatch '^[0-9a-f]{16}$' -and $meta.rawRoundtripSha256 -cmatch '^[0-9a-f]{64}$')
Require ($meta.schema -eq 1 -and $meta.kind -eq 'owned-fixed-vhd-ntfs')
Require ($meta.diskBytes -eq 16777216 -and $meta.fileBytes -eq 16777728)
Require ($meta.partitionStartSector -eq 2048 -and $meta.partitionSectors -eq 30720)
Require ($meta.sourceDeviceOpened -eq $false -and $meta.hostMountPerformed -eq $false)
Require ($meta.sha256 -cmatch '^[0-9a-f]{64}$' -and $meta.vhdIdentifier -cmatch '^[0-9a-f]{32}$')
Require ((Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $meta.sha256)
$stream = [IO.File]::OpenRead($imagePath)
try {
    $mbr = Read-At $stream 0 512
    $boot = Read-At $stream 1048576 512
    $footer = Read-At $stream 16777216 512
    Require ($mbr[510] -eq 85 -and $mbr[511] -eq 170 -and $mbr[446] -eq 0 -and $mbr[450] -eq 7)
    Require ([BitConverter]::ToUInt32($mbr,454) -eq 2048 -and [BitConverter]::ToUInt32($mbr,458) -eq 30720)
    for ($i=462; $i -lt 510; $i++) { Require ($mbr[$i] -eq 0) }
    Require ([Text.Encoding]::ASCII.GetString($boot,3,8) -ceq 'NTFS    ')
    Require ([BitConverter]::ToUInt16($boot,11) -eq 512 -and $boot[13] -eq 8)
    Require ([BitConverter]::ToUInt32($boot,28) -eq 2048)
    Require ((Hex $boot[72..79]) -ceq $meta.ntfsSerial)
    Require ([Text.Encoding]::ASCII.GetString($footer,0,8) -ceq 'conectix')
    Require ((Big-Number $footer 12 4) -eq 65536 -and (Big-Number $footer 60 4) -eq 2)
    Require ((Big-Number $footer 40 8) -eq 16777216 -and (Big-Number $footer 48 8) -eq 16777216)
    for ($i=16; $i -lt 24; $i++) { Require ($footer[$i] -eq 255) }
    Require ((Hex $footer[68..83]) -ceq $meta.vhdIdentifier)
    [UInt64]$sum = 0
    for ($i=0; $i -lt 512; $i++) { if ($i -lt 64 -or $i -gt 67) { $sum += $footer[$i] } }
    Require ((Big-Number $footer 64 4) -eq (4294967295 - $sum))
    $signature = [BitConverter]::ToUInt32($mbr,440)
} finally { $stream.Dispose() }
if ($InspectOnly) {
    @{ inspected=$true; diskBytes=16777216; fixedVhd=$true; ntfs=$true; mounted=$false; sha256=$meta.sha256 } | ConvertTo-Json -Compress
    return
}
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
Require ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
$binary = Join-Path ([IO.Path]::GetFullPath($BinaryDirectory)) 'rdp-worker.exe'
$workerSha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant()
$before = @(Get-Disk | Select-Object -ExpandProperty ObjectId)
$beforeLetters = @(Get-Volume | Where-Object DriveLetter | Select-Object -ExpandProperty DriveLetter)
$context = Join-Path $build ('owned-vhd-run-'+[Guid]::NewGuid().ToString('N'))
$security = New-Object Security.AccessControl.DirectorySecurity
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$security.SetOwner($sid)
$security.SetAccessRuleProtection($true,$false)
foreach ($identity in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $security.AddAccessRule($rule)
}
[void][IO.Directory]::CreateDirectory($context,$security)
$copy = Join-Path $context 'owned-full.vhd'
[IO.File]::Copy($imagePath,$copy,$false)
Require ((Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $meta.sha256)
$mounted = $false
$root = $null
$code = 1
$oldRoot = $env:BRIDGE_FILE_TEST_FULL_ROOT
$oldProof = $env:BRIDGE_FILE_TEST_WINDOWS_VOLUME_PROOF
$oldBinary = $env:BRIDGE_FILE_TEST_BINARY_DIR
try {
    $image = Mount-DiskImage -ImagePath $copy -StorageType VHD -Access ReadWrite -NoDriveLetter -PassThru
    $mounted = $true
    $disks = @($image | Get-Disk)
    Require ($disks.Count -eq 1)
    $disk = $disks[0]
    Assert-Disk $disk $before $signature
    $partitions = @($disk | Get-Partition)
    Require ($partitions.Count -eq 1)
    $part = $partitions[0]
    Require ($part.Offset -eq 1048576 -and $part.Size -eq 15728640 -and -not $part.DriveLetter)
    $part | Add-PartitionAccessPath -AssignDriveLetter
    $part = Get-Partition -DiskNumber $disk.Number -PartitionNumber $part.PartitionNumber
    $volume = $part | Get-Volume
    Require ($volume.FileSystem -eq 'NTFS' -and $volume.FileSystemLabel -eq 'BRIDGEFULL')
    Require ($volume.Size -le 16777216 -and $volume.SizeRemaining -ge 8388608)
    Require ($volume.DriveLetter -and $volume.DriveLetter -notin $beforeLetters)
    $root = [string]$volume.DriveLetter+':\bridge-owned-full-'+[Guid]::NewGuid().ToString('N')
    [void][IO.Directory]::CreateDirectory($root,$security)
    $proof = Join-Path $context 'proof.json'
    @{ schema=1; kind='owned-windows-vhd-full'; coordinatorPid=$PID; root=$root;
       diskBytes=16777216; imageSha256=$meta.sha256; volumeGuid=$volume.UniqueId } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $proof -Encoding UTF8
    $env:BRIDGE_FILE_TEST_FULL_ROOT = $root
    $env:BRIDGE_FILE_TEST_WINDOWS_VOLUME_PROOF = $proof
    $env:BRIDGE_FILE_TEST_BINARY_DIR = [IO.Path]::GetFullPath($BinaryDirectory)
    & $NodeExecutable --test --test-isolation=none --test-concurrency=1 tests/integration/files-disk-full.test.mjs 2>&1 |
        Tee-Object -FilePath (Join-Path $context 'native-http-test.log')
    $code = $LASTEXITCODE
    Require ($code -eq 0)
    Require (@(Get-ChildItem -LiteralPath $root -Force).Count -eq 0)
} finally {
    $env:BRIDGE_FILE_TEST_FULL_ROOT = $oldRoot
    $env:BRIDGE_FILE_TEST_WINDOWS_VOLUME_PROOF = $oldProof
    $env:BRIDGE_FILE_TEST_BINARY_DIR = $oldBinary
    if ($mounted) { Dismount-DiskImage -ImagePath $copy -StorageType VHD }
}
Require (-not (Get-DiskImage -ImagePath $copy).Attached)
Require ((Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $meta.sha256)
# The mutated private image remains under build for inspection; no recursive
# deletion or filesystem repair is performed by this coordinator.
$acceptance = @{ windowsPhysicalFull=($code -eq 0); detached=$true; imageSha256=$meta.sha256;
   sourceImagePreserved=$true; actualRdp=$false; workerSha256=$workerSha256 } | ConvertTo-Json -Compress
$acceptance | Set-Content -LiteralPath (Join-Path $context 'acceptance.json') -Encoding UTF8
Write-Output $acceptance
