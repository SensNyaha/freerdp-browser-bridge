param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{32}$')][string]$RunId,
    [Parameter(Mandatory=$true)][ValidatePattern('^S-1-5-21-[0-9-]+$')][string]$ExpectedSid,
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$ExpectedSessionId,
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{64}$')][string]$ScriptSha256
)
$ErrorActionPreference='Stop'
if([Diagnostics.Process]::GetCurrentProcess().SessionId -ne $ExpectedSessionId -or
   [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne $ExpectedSid){
    throw 'OWNED_TASK_CONTEXT_REFUSED'
}
$probe=Join-Path $PSScriptRoot 'windows-managed-files.ps1'
$file=Get-Item -LiteralPath $probe
if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $file.Length -gt 16384){throw 'OWNED_TASK_SOURCE_REFUSED'}
if((Get-FileHash -LiteralPath $probe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ScriptSha256){throw 'OWNED_TASK_SOURCE_REFUSED'}
& $probe -RunId $RunId -DiskFull -ExhaustAllocationTail
