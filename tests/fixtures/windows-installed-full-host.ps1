param([Parameter(Mandatory=$true)][ValidateSet('mount','unmount','rdp-state','rdp-start','account','certificate','install','configure','identity','task','retire','rdp-retire')][string]$Action)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false,$true)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false,$true)
$script:json = $null

function Own-Require([bool]$Condition) { if (-not $Condition) { throw 'OWNED_INSTALLED_HOST_REFUSED' } }
function Own-Plain([string]$Path, [bool]$Directory = $false) {
    $item = Get-Item -LiteralPath $Path -Force
    Own-Require (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint))
    Own-Require ($item.PSIsContainer -eq $Directory)
    return $item
}
function Own-Json([object]$Value) { return ConvertTo-OwnedInstalledPublicJson $Value }
function Own-NewJson([string]$Path, [object]$Value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes((Own-Json $Value))
    Own-Require ($bytes.Length -le 32768)
    $file = [IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $file.Write($bytes,0,$bytes.Length);$file.Flush() } finally { $file.Dispose() }
}
function Own-ReadJson([string]$Path) {
    $item = Own-Plain $Path
    Own-Require ($item.Length -gt 0 -and $item.Length -le 32768)
    return $script:json.DeserializeObject([IO.File]::ReadAllText($Path))
}
function Own-Hash([string]$Path) {
    $algorithm = [Security.Cryptography.SHA256]::Create();$file = [IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($algorithm.ComputeHash($file)).Replace('-','').ToLowerInvariant() }
    finally { $file.Dispose();$algorithm.Dispose() }
}
function Own-PrivateDirectory([string]$Path) {
    Own-Require (-not (Test-Path -LiteralPath $Path))
    $security = New-Object Security.AccessControl.DirectorySecurity
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $security.SetOwner($sid);$security.SetAccessRuleProtection($true,$false)
    foreach ($identity in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $security.AddAccessRule($rule)
    }
    [void][IO.Directory]::CreateDirectory($Path,$security)
}
function Own-MsiDataDirectory([string]$Path) {
    Own-Require (-not (Test-Path -LiteralPath $Path))
    $security = New-OwnedInstalledDataRootSecurity
    [void][IO.Directory]::CreateDirectory($Path,$security)
}
function Own-MountRecord {
    $record = Own-ReadJson (Join-Path $script:context 'mount.json')
    Own-Require ($record.id -ceq $script:data.id -and $record.copy -ceq (Join-Path $script:context 'owned-full.vhd'))
    Own-Require ($record.root -cmatch '^[A-Z]:\\bridge-owned-full-[0-9a-f]{32}$')
    Own-Require ([IO.Path]::GetFileName($record.root) -ceq ('bridge-owned-full-'+$script:data.id))
    return $record
}
function Own-InstallRecord {
    $record = Own-ReadJson (Join-Path $script:context 'install.json')
    Own-Require ($record.id -ceq $script:data.id -and $record.root -ceq (Own-MountRecord).root)
    Own-Require ($record.program -ceq (Join-Path $env:ProgramFiles 'FreeRDP Bridge'))
    Own-Require ($record.productCode -cmatch '^\{[0-9A-F-]{36}\}$')
    return $record
}
function Own-Service([bool]$Required = $true) {
    $installation = Own-InstallRecord
    $service = Get-CimInstance Win32_Service -Filter "Name='FreeRDPBridge'"
    if (-not $service) { Own-Require (-not $Required);return $null }
    $expected = '"'+(Join-Path $installation.program 'bridge-service.exe')+'" --config "'+(Join-Path $installation.root 'config\bridge.json')+'" --runtime-root "'+(Join-Path $installation.root 'runtime')+'"'
    Own-Require ($service.PathName -ceq $expected -and $service.StartName -ceq 'NT AUTHORITY\LocalService')
    return $service
}
function Own-StopService {
    $service = Own-Service $false
    if ($service -and $service.State -ne 'Stopped') {
        Stop-Service -Name FreeRDPBridge
        (Get-Service FreeRDPBridge).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(20))
    }
    if ($service) { Own-Require ((Own-Service).ProcessId -eq 0) }
}
function Own-Account {
    $marker = Own-ReadJson (Join-Path $script:context 'account.json')
    Own-Require ($marker.id -ceq $script:data.id -and $marker.name -ceq ('bridgefull_'+$script:data.id.Substring(0,8)))
    $account = Get-LocalUser -Name $marker.name
    Own-Require ($account.SID.Value -ceq $marker.sid)
    return $account
}
function Own-Sessions([string]$Name) {
    $expected = $env:COMPUTERNAME+'\'+$Name
    return @(Get-Process -IncludeUserName -ErrorAction SilentlyContinue | Where-Object { $_.UserName -ieq $expected -and $_.SessionId -gt 0 } | Select-Object -ExpandProperty SessionId -Unique)
}
function Own-RunMsi([string]$Arguments) {
    $installerProcess=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\msiexec.exe') -ArgumentList $Arguments -PassThru -WindowStyle Hidden
    $null=$installerProcess.Handle
    try {
        if(-not $installerProcess.WaitForExit(120000)) {
            try {
            $installation=Own-InstallRecord
            $service=Own-Service $false
            $permissions=@()
            foreach($path in @($installation.root,(Join-Path $installation.root 'config'),(Join-Path $installation.root 'config\bridge.json'),(Join-Path $installation.root 'runtime'))){
                if(Test-Path -LiteralPath $path){$acl=Get-Acl -LiteralPath $path;$permissions+=@{path=$path;owner=$acl.Owner;sddl=$acl.Sddl}}
            }
            $diagnostic=@{permissions=$permissions;service=$null}
            if($service){$diagnostic.service=@{state=$service.State;pid=[int]$service.ProcessId;exitCode=[int]$service.ExitCode;serviceExitCode=[int]$service.ServiceSpecificExitCode;checkPoint=[int]$service.CheckPoint;waitHint=[int]$service.WaitHint}}
            Own-NewJson (Join-Path $script:context ('service-start-deadline-'+$Action+'.json')) $diagnostic
            # Terminate only this fresh product's verified service process, so
            # MSI can observe failed startup and complete its own rollback.
            if($service -and $service.ProcessId -gt 1){
                $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$service.ProcessId) -Property ProcessId,ExecutablePath
                Own-Require ($process.ExecutablePath -ceq (Join-Path $installation.program 'bridge-service.exe'))
                $sid=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
                Own-Require ($sid.ReturnValue -eq 0 -and $sid.Sid -ceq 'S-1-5-19')
                Stop-Process -Id $service.ProcessId -Force
            }
            } finally {
                if(-not $installerProcess.WaitForExit(30000)){$installerProcess.Kill();[void]$installerProcess.WaitForExit(10000)}
            }
            throw 'OWNED_INSTALLED_MSI_DEADLINE'
        }
        Own-Require ($installerProcess.ExitCode -eq 0)
    } finally { $installerProcess.Dispose() }
}

try {
    Own-Require ($env:GITHUB_ACTIONS -ceq 'true' -and $env:RUNNER_OS -ceq 'Windows')
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    Own-Require ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
    Import-Module (Join-Path $PSScriptRoot 'windows-installed-full-config.psm1')
    Add-Type -AssemblyName System.Web.Extensions
    $script:json = New-Object Web.Script.Serialization.JavaScriptSerializer
    $script:json.MaxJsonLength = 32768;$script:json.RecursionLimit = 16
    $builder = New-Object Text.StringBuilder
    while (($character = [Console]::In.Read()) -ne -1) {
        Own-Require ($builder.Length -lt 32768)
        [void]$builder.Append([char]$character)
    }
    # Do not pass credential-bearing JSON through PowerShell logging cmdlets.
    $script:data = $script:json.DeserializeObject($builder.ToString())
    [void]$builder.Clear()
    Own-Require ($script:data -is [Collections.IDictionary] -and $script:data.id -cmatch '^[0-9a-f]{32}$')
    $parent = (Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID) -Property ParentProcessId).ParentProcessId
    Own-Require ($script:data.coordinatorPid -eq $parent -and $parent -gt 1)
    $build = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../build')).Path
    $script:context = Join-Path $build ('windows-msi-run-'+$script:data.id)
    $answer = @{}
    switch ($Action) {
        'mount' {
            $source = [IO.Path]::GetFullPath($script:data.imageDirectory)
            $null = . "$PSScriptRoot/windows-owned-full-volume.ps1" -ImageDirectory $source -InspectOnly
            # The existing read-only inspector supplies verified meta/signature.
            $verifiedSource = $imagePath;$verifiedMeta = $meta;$verifiedSignature = $signature
            Own-PrivateDirectory $script:context
            $copy = Join-Path $script:context 'owned-full.vhd'
            [IO.File]::Copy($verifiedSource,$copy,$false)
            Own-Require ((Own-Hash $copy) -ceq $verifiedMeta.sha256)
            $beforeDisks = @(Get-Disk | Select-Object -ExpandProperty ObjectId)
            $beforeLetters = @(Get-Volume | Where-Object DriveLetter | Select-Object -ExpandProperty DriveLetter)
            Own-NewJson (Join-Path $script:context 'mount-intent.json') @{id=$script:data.id;copy=$copy;source=$verifiedSource;imageSha256=$verifiedMeta.sha256;signature=$verifiedSignature;beforeDisks=$beforeDisks}
            try {
                $image = Mount-DiskImage -ImagePath $copy -StorageType VHD -Access ReadWrite -NoDriveLetter -PassThru
                $disks = @($image | Get-Disk);Own-Require ($disks.Count -eq 1)
                Assert-Disk $disks[0] $beforeDisks $verifiedSignature
                $partitions = @($disks[0] | Get-Partition);Own-Require ($partitions.Count -eq 1)
                $part = $partitions[0]
                Own-Require ($part.Offset -eq 1048576 -and $part.Size -eq 15728640 -and -not $part.DriveLetter)
                $null=$part | Add-PartitionAccessPath -AssignDriveLetter
                $part = Get-Partition -DiskNumber $disks[0].Number -PartitionNumber $part.PartitionNumber
                $volume = $part | Get-Volume
                Own-Require ($volume.DriveLetter -and $volume.DriveLetter -notin $beforeLetters -and $volume.FileSystem -ceq 'NTFS')
                Own-Require ($volume.FileSystemLabel -ceq 'BRIDGEFULL' -and $volume.Size -le 16777216 -and $volume.SizeRemaining -ge 4194304)
                $root = [string]$volume.DriveLetter+':\bridge-owned-full-'+$script:data.id
                # Match the MSI's administrative data-root ownership contract;
                # the separate control context remains private to its creator.
                Own-MsiDataDirectory $root
                $proofPath = Join-Path $script:context 'proof.json'
                $answer = @{id=$script:data.id;root=$root;proofPath=$proofPath;context=$script:context;copy=$copy;source=$verifiedSource;imageSha256=$verifiedMeta.sha256;signature=$verifiedSignature;volumeGuid=$volume.UniqueId}
                Own-NewJson (Join-Path $script:context 'mount.json') $answer
                Own-NewJson $proofPath @{schema=1;kind='owned-windows-vhd-full';coordinatorPid=$parent;root=$root;diskBytes=16777216;imageSha256=$verifiedMeta.sha256;volumeGuid=$volume.UniqueId}
            } catch {
                if ((Get-DiskImage -ImagePath $copy).Attached) { $null=Dismount-DiskImage -ImagePath $copy -StorageType VHD }
                throw
            }
        }
        'unmount' {
            $intent=Own-ReadJson (Join-Path $script:context 'mount-intent.json')
            Own-Require ($intent.id -ceq $script:data.id -and $intent.copy -ceq (Join-Path $script:context 'owned-full.vhd'))
            $mounted = $null
            if(Test-Path -LiteralPath (Join-Path $script:context 'mount.json')){$mounted=Own-MountRecord}
            $image = Get-DiskImage -ImagePath $intent.copy
            $empty=$true
            if ($image.Attached) {
                $disks = @($image | Get-Disk);Own-Require ($disks.Count -eq 1)
                Own-Require ($disks[0].Size -eq 16777216 -and -not $disks[0].IsBoot -and -not $disks[0].IsSystem -and $disks[0].Signature -eq $intent.signature -and $disks[0].ObjectId -notin $intent.beforeDisks)
                $volume = $disks[0] | Get-Partition | Get-Volume
                if($mounted){Own-Require ($volume.UniqueId -ceq $mounted.volumeGuid)}
                $root=[string]$volume.DriveLetter+':\bridge-owned-full-'+$script:data.id
                if (Test-Path -LiteralPath $root) { $empty = @(Get-ChildItem -LiteralPath $root -Force).Count -eq 0 }
                $null=Dismount-DiskImage -ImagePath $intent.copy -StorageType VHD
            }
            $answer = @{detached=(-not (Get-DiskImage -ImagePath $intent.copy).Attached);rootEmpty=$empty;sourceImagePreserved=((Own-Hash $intent.source) -ceq $intent.imageSha256)}
        }
        'rdp-state' {
            $path = 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server'
            $deny = (Get-ItemProperty -LiteralPath $path -Name fDenyTSConnections).fDenyTSConnections
            Own-Require ($deny -in @(0,1))
            Own-Require ((Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name PortNumber).PortNumber -eq 3389)
            $services = @{}
            foreach ($name in @('TermService','SessionEnv','UmRdpService')) {
                $state = [string](Get-Service -Name $name).Status;Own-Require ($state -in @('Running','Stopped'));$services[$name]=$state
            }
            $name = 'bridgefull_'+$script:data.id.Substring(0,8)
            Own-Require (-not (Get-LocalUser -Name $name -ErrorAction SilentlyContinue))
            $answer = @{deny=[int]$deny;services=$services}
            Own-NewJson (Join-Path $script:context 'rdp-state.json') $answer
        }
        'rdp-start' {
            $state = Own-ReadJson (Join-Path $script:context 'rdp-state.json')
            Own-Require ($state.deny -in @(0,1))
            Set-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 0
            Start-Service TermService
            (Get-Service TermService).WaitForStatus('Running',[TimeSpan]::FromSeconds(20))
            $answer = @{running=$true;firewallRulesAdded=$false;securityProtocolDowngraded=$false}
        }
        'account' {
            $name = 'bridgefull_'+$script:data.id.Substring(0,8)
            Own-Require (-not (Get-LocalUser -Name $name -ErrorAction SilentlyContinue))
            Own-Require ($script:data.password -is [string] -and $script:data.password -cmatch '^[\x21-\x7e]{32,128}$')
            $secure = New-Object Security.SecureString
            foreach ($character in $script:data.password.ToCharArray()) { $secure.AppendChar($character) }
            $secure.MakeReadOnly();$account = $null;$recorded = $false
            try {
                $account = New-LocalUser -Name $name -Password $secure -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword
                Own-NewJson (Join-Path $script:context 'account.json') @{id=$script:data.id;name=$name;sid=$account.SID.Value}
                $recorded=$true
                $group = Get-LocalGroup -SID (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-555'))
                Add-LocalGroupMember -Group $group -Member $account
                $answer=@{sid=$account.SID.Value;name=$name;domain=$env:COMPUTERNAME}
            } finally {
                $secure.Dispose();$script:data.password=$null
                if ($account -and -not $recorded) { Own-Require ((Get-LocalUser -Name $name).SID.Value -ceq $account.SID.Value);Remove-LocalUser -SID $account.SID }
            }
        }
        'certificate' {
            $deadline=[Diagnostics.Stopwatch]::StartNew();$certificates=@()
            do {
                $listener=Get-CimInstance -Namespace root/cimv2/TerminalServices -ClassName Win32_TSGeneralSetting -Filter "TerminalName='RDP-tcp'"
                $thumbprint=$listener.SSLCertificateSHA1Hash
                if ($thumbprint -cmatch '^[0-9A-Fa-f]{40}$') {
                    $certificates=@(Get-ChildItem -LiteralPath 'Cert:\LocalMachine\Remote Desktop','Cert:\LocalMachine\My' | Where-Object { $_.Thumbprint -ieq $thumbprint })
                }
                if ($certificates.Count -eq 1) { break };Start-Sleep -Milliseconds 200
            } while ($deadline.ElapsedMilliseconds -lt 20000)
            Own-Require ($certificates.Count -eq 1)
            $algorithm=[Security.Cryptography.SHA256]::Create()
            try { $fingerprint='sha256:'+([BitConverter]::ToString($algorithm.ComputeHash($certificates[0].RawData)).Replace('-','').ToLowerInvariant()) } finally { $algorithm.Dispose() }
            $answer=@{fingerprint=$fingerprint;derivedFromLocalListener=$true}
        }
        'install' {
            $mounted=Own-MountRecord;$inputs=Own-ReadJson $script:data.inputs
            Own-Require ($inputs.publicStableRelease -eq $true -and $inputs.sha256 -cmatch '^[0-9a-f]{64}$')
            $msi=Own-Plain $inputs.output;Own-Require ($msi.Length -eq $inputs.bytes -and (Own-Hash $msi.FullName) -ceq $inputs.sha256)
            Own-Require ($msi.FullName.StartsWith($build+'\',[StringComparison]::OrdinalIgnoreCase))
            $program=Join-Path $env:ProgramFiles 'FreeRDP Bridge'
            Own-Require (-not (Test-Path -LiteralPath $program) -and -not (Test-Path -LiteralPath (Join-Path $env:ProgramData 'FreeRDPBridge')))
            Own-Require (-not (Get-Service FreeRDPBridge -ErrorAction SilentlyContinue))
            $installer=New-Object -ComObject WindowsInstaller.Installer;$database=$null
            try {
                $database=$installer.OpenDatabase($msi.FullName,0)
                $view=$database.OpenView('SELECT `Property`,`Value` FROM `Property`');$view.Execute();$properties=@{}
                while($row=$view.Fetch()) { try {$properties[$row.StringData(1)]=$row.StringData(2)} finally {[void][Runtime.InteropServices.Marshal]::ReleaseComObject($row)} }
                $view.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($view)
                Own-Require ($properties.ProductVersion -ceq $inputs.version -and $properties.ALLUSERS -ceq '1')
                Own-Require ($properties.UpgradeCode -ceq '{A06AFCCA-3B34-42B3-93B6-BB0900E1F295}')
                Own-Require ($installer.ProductState($properties.ProductCode) -eq -1)
                Own-NewJson (Join-Path $script:context 'install.json') @{id=$script:data.id;root=$mounted.root;program=$program;productCode=$properties.ProductCode;msi=$msi.FullName;sha256=$inputs.sha256}
            } finally {
                if($database){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($database)}
                [void][Runtime.InteropServices.Marshal]::ReleaseComObject($installer)
            }
            $arguments='/i "'+$msi.FullName+'" /qn /norestart DATADIR="'+$mounted.root+'" /L*v "'+(Join-Path $script:context 'msi-install.log')+'"'
            Own-RunMsi $arguments
            $service=Own-Service
            Own-Require ($service.State -eq 'Running')
            Own-NewJson (Join-Path $script:context 'default-config.json') (Own-ReadJson (Join-Path $mounted.root 'config\bridge.json'))
            $answer=@{installed=$true;servicePathVerified=$true;msiSha256=$inputs.sha256}
        }
        'configure' {
            $installation=Own-InstallRecord;Own-StopService
            $config=Confirm-OwnedInstalledConfiguration $script:data.configuration
            $path=Join-Path $installation.root 'config\bridge.json';$null=Own-Plain $path
            [IO.File]::WriteAllText($path,(Own-Json $config),(New-Object Text.UTF8Encoding($false)))
            Start-Service FreeRDPBridge;(Get-Service FreeRDPBridge).WaitForStatus('Running',[TimeSpan]::FromSeconds(20))
            $service=Own-Service;$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$service.ProcessId) -Property ProcessId,ExecutablePath
            $sid=Invoke-CimMethod -InputObject $process -MethodName GetOwnerSid
            Own-Require ($sid.ReturnValue -eq 0 -and $sid.Sid -ceq 'S-1-5-19')
            $answer=@{servicePid=[int]$service.ProcessId;serviceSid=$sid.Sid}
        }
        'identity' {
            $installation=Own-InstallRecord;$service=Own-Service
            $rows=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,ExecutablePath,Name)
            $ids=New-Object 'Collections.Generic.HashSet[uint32]';[void]$ids.Add([uint32]$service.ProcessId)
            for($i=0;$i -lt $rows.Count;$i++){foreach($row in $rows){if($ids.Contains([uint32]$row.ParentProcessId)){[void]$ids.Add([uint32]$row.ProcessId)}}}
            $path=Join-Path $installation.program 'service\node_modules\@freerdp-bridge\runtime-win32-x64\runtime\bin\rdp-worker.exe'
            $workers=@($rows | Where-Object {$ids.Contains([uint32]$_.ProcessId) -and $_.ExecutablePath -ceq $path})
            Own-Require ($workers.Count -eq 1)
            $sid=Invoke-CimMethod -InputObject $workers[0] -MethodName GetOwnerSid
            Own-Require ($sid.ReturnValue -eq 0 -and $sid.Sid -ceq 'S-1-5-19')
            $answer=@{nativePid=[int]$workers[0].ProcessId;workerSid=$sid.Sid;workerSha256=(Own-Hash $path)}
        }
        'task' {
            $account=Own-Account;$deadline=[Diagnostics.Stopwatch]::StartNew();$sessions=@()
            do {$sessions=@(Own-Sessions $account.Name);if($sessions.Count -eq 1){break};Start-Sleep -Milliseconds 200}while($deadline.ElapsedMilliseconds -lt 30000)
            Own-Require ($sessions.Count -eq 1)
            $name='BridgeOwnedFull_'+$script:data.id
            Own-Require (-not (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue))
            Own-Require ($script:data.scriptSha256 -is [string] -and $script:data.scriptSha256 -cmatch '^[0-9a-f]{64}$')
            $probeSource=Join-Path $PSScriptRoot 'windows-managed-files.ps1'
            $null=Own-Plain $probeSource
            Own-Require ((Own-Hash $probeSource) -ceq $script:data.scriptSha256)
            $probeDirectory=Join-Path $script:context 'probe'
            Own-PrivateDirectory $probeDirectory
            $probeSecurity=Get-Acl -LiteralPath $probeDirectory
            $readerRule=New-Object Security.AccessControl.FileSystemAccessRule($account.SID,'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')
            $probeSecurity.AddAccessRule($readerRule);Set-Acl -LiteralPath $probeDirectory -AclObject $probeSecurity
            $contextSecurity=Get-Acl -LiteralPath $script:context
            $traverseRule=New-Object Security.AccessControl.FileSystemAccessRule($account.SID,'Traverse','None','None','Allow')
            $contextSecurity.AddAccessRule($traverseRule);Set-Acl -LiteralPath $script:context -AclObject $contextSecurity
            foreach($filename in @('windows-installed-task.ps1','windows-managed-files.ps1')) {
                $sourcePath=Join-Path $PSScriptRoot $filename;$null=Own-Plain $sourcePath
                [IO.File]::Copy($sourcePath,(Join-Path $probeDirectory $filename),$false)
            }
            $taskScript=Join-Path $probeDirectory 'windows-installed-task.ps1'
            $arguments='-NoProfile -NonInteractive -File "'+$taskScript+'" -RunId '+$script:data.id+' -ExpectedSid '+$account.SID.Value+' -ExpectedSessionId '+$sessions[0]+' -ScriptSha256 '+$script:data.scriptSha256
            $taskAction=New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $arguments
            # Interactive uses the existing token; no password is registered.
            $principal=New-ScheduledTaskPrincipal -UserId $account.SID.Value -LogonType Interactive -RunLevel Limited
            $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::FromMinutes(3)) -MultipleInstances IgnoreNew
            [void](Register-ScheduledTask -TaskName $name -Action $taskAction -Principal $principal -Settings $settings)
            Own-NewJson (Join-Path $script:context 'task.json') @{name=$name;sid=$account.SID.Value;sessionId=[int]$sessions[0]}
            Start-ScheduledTask -TaskName $name
            $answer=@{started=$true;sessionId=[int]$sessions[0];passwordStored=$false}
        }
        'retire' {
            $installation=Own-InstallRecord;Own-StopService
            $runtime=Join-Path $installation.root 'runtime'
            $empty= -not (Test-Path -LiteralPath $runtime)
            if(-not $empty){$empty=@(Get-ChildItem -LiteralPath $runtime -Force).Count -eq 0}
            $installer=New-Object -ComObject WindowsInstaller.Installer
            try {$registered=$installer.ProductState($installation.productCode) -ne -1}finally{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($installer)}
            if($registered){
                $arguments='/x '+$installation.productCode+' /qn /norestart /L*v "'+(Join-Path $script:context 'msi-uninstall.log')+'"'
                Own-RunMsi $arguments
            }
            Own-Require (-not (Get-Service FreeRDPBridge -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath $installation.program))
            $configDirectory=Join-Path $installation.root 'config'
            if(Test-Path -LiteralPath $configDirectory){
                $null=Own-Plain $configDirectory $true
                $entries=@(Get-ChildItem -LiteralPath $configDirectory -Force)
                Own-Require ($entries.Count -eq 1 -and $entries[0].Name -ceq 'bridge.json')
                $null=Own-Plain $entries[0].FullName;Remove-Item -LiteralPath $entries[0].FullName
                [IO.Directory]::Delete($configDirectory,$false)
            }
            if($empty -and (Test-Path -LiteralPath $runtime)){$null=Own-Plain $runtime $true;[IO.Directory]::Delete($runtime,$false)}
            $answer=@{uninstalled=$true;runtimeEmpty=$empty;nativeJoined=$empty}
        }
        'rdp-retire' {
            $taskPath=Join-Path $script:context 'task.json'
            if(Test-Path -LiteralPath $taskPath){
                $taskRecord=Own-ReadJson $taskPath;Own-Require ($taskRecord.name -ceq ('BridgeOwnedFull_'+$script:data.id))
                $task=Get-ScheduledTask -TaskName $taskRecord.name -ErrorAction SilentlyContinue
                if($task){
                    $taskAccount=Own-Account
                    Own-Require ($taskAccount.SID.Value -ceq $taskRecord.sid)
                    $principals=@($taskRecord.sid,($env:COMPUTERNAME+'\'+$taskAccount.Name),$taskAccount.Name)
                    Own-Require ($principals -icontains $task.Principal.UserId)
                    Unregister-ScheduledTask -TaskName $taskRecord.name -Confirm:$false
                }
            }
            $accountPath=Join-Path $script:context 'account.json'
            if(Test-Path -LiteralPath $accountPath){
                $account=Own-Account
                foreach($session in @(Own-Sessions $account.Name)) {& (Join-Path $env:SystemRoot 'System32\logoff.exe') ([string]$session) *> $null;Own-Require ($LASTEXITCODE -eq 0)}
                $deadline=[Diagnostics.Stopwatch]::StartNew()
                do {$sessions=@(Own-Sessions $account.Name);if(-not $sessions.Count){break};Start-Sleep -Milliseconds 200}while($deadline.ElapsedMilliseconds -lt 20000)
                Own-Require ($sessions.Count -eq 0)
                $profileClock=[Diagnostics.Stopwatch]::StartNew()
                do {
                    $ownedProfile=Get-CimInstance Win32_UserProfile -Filter ("SID='"+$account.SID.Value+"'")
                    if(-not $ownedProfile -or -not $ownedProfile.Loaded){break}
                    Start-Sleep -Milliseconds 200
                } while($profileClock.ElapsedMilliseconds -lt 20000)
                if($ownedProfile){
                    $users=[IO.Path]::GetPathRoot($env:SystemRoot)+'Users\';$path=[IO.Path]::GetFullPath($ownedProfile.LocalPath)
                    Own-Require (-not $ownedProfile.Special -and -not $ownedProfile.Loaded -and $path.StartsWith($users,[StringComparison]::OrdinalIgnoreCase))
                    Own-Require ([IO.Path]::GetFileName($path) -ieq $account.Name)
                    Remove-CimInstance -InputObject $ownedProfile
                }
                Remove-LocalUser -SID $account.SID
            }
            $statePath=Join-Path $script:context 'rdp-state.json'
            if(Test-Path -LiteralPath $statePath){
                $state=Own-ReadJson $statePath;Own-Require ($state.deny -in @(0,1))
                Set-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value $state.deny
                foreach($name in @('UmRdpService','SessionEnv','TermService')){if($state.services[$name] -ceq 'Stopped' -and (Get-Service $name).Status -ne 'Stopped'){Stop-Service -Name $name; (Get-Service $name).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(20))}}
            }
            $answer=@{accountRemoved=$true;taskRemoved=$true;rdpStateRestored=$true;firewallRulesAdded=$false}
        }
    }
    [Console]::Out.WriteLine((Own-Json @{ok=$true;action=$Action;result=$answer}))
} catch {
    $lines=@([regex]::Matches([string]$_.ScriptStackTrace,': line ([0-9]+)') | Select-Object -First 6 | ForEach-Object {[int]$_.Groups[1].Value})
    if($script:json){[Console]::Out.WriteLine((Own-Json @{ok=$false;code='OWNED_INSTALLED_HOST_REFUSED';action=$Action;lines=$lines}))}
    else {[Console]::Out.WriteLine('{"ok":false,"code":"OWNED_INSTALLED_HOST_REFUSED"}')}
    exit 1
}
