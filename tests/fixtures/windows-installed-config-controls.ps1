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
$security=New-OwnedInstalledDataRootSecurity
if($security.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne 'S-1-5-32-544' -or -not $security.AreAccessRulesProtected){throw 'OWNED_TEST_DATA_ROOT_OWNER_FAILED'}
$rules=$security.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier])
if($rules.Count -ne 3){throw 'OWNED_TEST_DATA_ROOT_ACL_FAILED'}
foreach($rule in $rules){
    $expected=if($rule.IdentityReference.Value -ceq 'S-1-5-19'){
        [Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Synchronize
    }else{[Security.AccessControl.FileSystemRights]::FullControl}
    if($rule.IdentityReference.Value -cnotmatch '^S-1-5-(18|19|32-544)$' -or $rule.FileSystemRights -ne $expected -or $rule.AccessControlType -ne 'Allow' -or $rule.IsInherited -or $rule.InheritanceFlags -ne [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'){throw 'OWNED_TEST_DATA_ROOT_ACL_FAILED'}
}
$imageOwner=New-Object Security.Principal.SecurityIdentifier('S-1-5-21-101-102-103-1001')
$imageSecurity=New-OwnedInstalledImageSecurity $imageOwner
if($imageSecurity.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $imageOwner.Value -or -not $imageSecurity.AreAccessRulesProtected){throw 'OWNED_TEST_IMAGE_OWNER_FAILED'}
$imageRules=$imageSecurity.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier])
if($imageRules.Count -ne 3){throw 'OWNED_TEST_IMAGE_ACL_FAILED'}
foreach($rule in $imageRules){
    $expected=if($rule.IdentityReference.Value -ceq 'S-1-5-19'){
        [Security.AccessControl.FileSystemRights]::ReadAndExecute -bor [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Synchronize
    }else{[Security.AccessControl.FileSystemRights]::FullControl}
    if($rule.IdentityReference.Value -cnotin @($imageOwner.Value,'S-1-5-18','S-1-5-19') -or $rule.FileSystemRights -ne $expected -or $rule.AccessControlType -ne 'Allow' -or $rule.IsInherited -or $rule.InheritanceFlags -ne 'None'){throw 'OWNED_TEST_IMAGE_ACL_FAILED'}
}
$publicPath=Join-Path 'C:\owned-fixture' 'proof.json'
$marker=@{context=$publicPath;source=$publicPath;signature=[uint32]4294967000}
$roundtrip=$decoder.DeserializeObject((ConvertTo-OwnedInstalledPublicJson $marker))
if($roundtrip.context -cne $publicPath -or $roundtrip.source -cne $publicPath -or $roundtrip.signature -ne 4294967000){throw 'OWNED_TEST_PUBLIC_MARKER_FAILED'}
[Console]::Out.WriteLine($decoder.Serialize(@{accepted=$accepted;refused=$refused;publicMarkerRoundtrip=$true}))
