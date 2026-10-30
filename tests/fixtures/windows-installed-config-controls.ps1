# Only the pure configuration validator is imported; no host-helper execution.
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'windows-installed-full-config.psm1')
Add-Type -AssemblyName System.Web.Extensions
$decoder=New-Object Web.Script.Serialization.JavaScriptSerializer
$decoder.MaxJsonLength=32768;$decoder.RecursionLimit=16
$text=New-Object Text.StringBuilder
while(($character=[Console]::In.Read()) -ne -1){
    if($text.Length -ge 32768){throw 'OWNED_TEST_INPUT_LIMIT'}
    [void]$text.Append([char]$character)
}
$cases=$decoder.DeserializeObject($text.ToString())
$accepted=0;$refused=0
for($index=0;$index -lt $cases.Count;$index++){
    try {
        $null=Confirm-OwnedInstalledConfiguration $cases[$index]
        if($index -ne 0){throw 'OWNED_TEST_INVALID_ACCEPTED'}
        $accepted++
    } catch {
        if($index -eq 0 -or $_.Exception.Message -cne 'OWNED_INSTALLED_HOST_REFUSED'){throw}
        $refused++
    }
}
[Console]::Out.WriteLine($decoder.Serialize(@{accepted=$accepted;refused=$refused}))
