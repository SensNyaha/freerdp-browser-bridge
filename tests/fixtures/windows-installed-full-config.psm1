# Pure validation only. Importing this module performs no host operations.
function Require-OwnedInstalledConfiguration([bool]$Condition) {
    if (-not $Condition) { throw 'OWNED_INSTALLED_HOST_REFUSED' }
}
function Confirm-OwnedKeyShape([object]$Value,[string]$Expected) {
    Require-OwnedInstalledConfiguration ($Value -is [Collections.IDictionary])
    $names=New-Object 'Collections.Generic.List[string]'
    foreach($name in $Value.get_Keys()){[void]$names.Add([string]$name)}
    $names.Sort([StringComparer]::Ordinal)
    Require-OwnedInstalledConfiguration ([string]::Join(',',$names) -ceq $Expected)
}
function Confirm-OwnedInstalledConfiguration([object]$Config) {
    Confirm-OwnedKeyShape $Config 'allowedOrigins,auth,files,limits,listen,schemaVersion,targets'
    Confirm-OwnedKeyShape $Config.listen 'host,port'
    Confirm-OwnedKeyShape $Config.limits 'maxPerPrincipal,maxSessions'
    Confirm-OwnedKeyShape $Config.files 'maxEntries,maxFileBytes,maxTotalBytes,xrdpLegacyDelete'
    Confirm-OwnedKeyShape $Config.auth 'audience,issuer,jwks'
    Confirm-OwnedKeyShape $Config.auth.jwks 'keys'
    Require-OwnedInstalledConfiguration ($Config.schemaVersion -is [int] -and $Config.schemaVersion -eq 1)
    Require-OwnedInstalledConfiguration ($Config.listen.host -is [string] -and $Config.listen.host -ceq '127.0.0.1' -and $Config.listen.port -is [int] -and $Config.listen.port -eq 8080)
    Require-OwnedInstalledConfiguration ($Config.allowedOrigins -is [object[]] -and $Config.allowedOrigins.Count -eq 1 -and $Config.allowedOrigins[0] -is [string] -and $Config.allowedOrigins[0] -ceq 'http://127.0.0.1:47997')
    Require-OwnedInstalledConfiguration ($Config.targets -is [object[]] -and $Config.targets.Count -eq 1)
    Confirm-OwnedKeyShape $Config.targets[0] 'host,port'
    Require-OwnedInstalledConfiguration ($Config.targets[0].host -is [string] -and $Config.targets[0].host -ceq '127.0.0.1' -and $Config.targets[0].port -is [int] -and $Config.targets[0].port -eq 3389)
    Require-OwnedInstalledConfiguration ($Config.limits.maxSessions -is [int] -and $Config.limits.maxSessions -eq 1 -and $Config.limits.maxPerPrincipal -is [int] -and $Config.limits.maxPerPrincipal -eq 1)
    Require-OwnedInstalledConfiguration ($Config.files.maxTotalBytes -is [int] -and $Config.files.maxTotalBytes -eq 4194304 -and $Config.files.maxFileBytes -is [int] -and $Config.files.maxFileBytes -eq 2097152 -and $Config.files.maxEntries -is [int] -and $Config.files.maxEntries -eq 64 -and $Config.files.xrdpLegacyDelete -is [bool] -and $Config.files.xrdpLegacyDelete -eq $false)
    Require-OwnedInstalledConfiguration ($Config.auth.issuer -is [string] -and $Config.auth.issuer -ceq 'https://owned-msi.example.test' -and $Config.auth.audience -is [string] -and $Config.auth.audience -ceq 'bridge')
    # Dictionary.Keys is a .NET property; the JSON "keys" needs an indexer.
    $jwkKeys=$Config.auth.jwks['keys']
    Require-OwnedInstalledConfiguration ($jwkKeys -is [object[]] -and $jwkKeys.Count -eq 1)
    $key=$jwkKeys[0]
    Confirm-OwnedKeyShape $key 'alg,e,kid,kty,n,use'
    foreach($name in @('kty','e','alg','use','kid','n')){Require-OwnedInstalledConfiguration ($key[$name] -is [string])}
    Require-OwnedInstalledConfiguration ($key.kty -ceq 'RSA' -and $key.e -ceq 'AQAB' -and $key.alg -ceq 'RS256' -and $key.use -ceq 'sig' -and $key.kid -ceq 'owned')
    Require-OwnedInstalledConfiguration ($key.n -cmatch '^[A-Za-z0-9_-]{342,683}$')
    return $Config
}
function ConvertTo-OwnedInstalledPublicJson([object]$Value) {
    # Public output/markers only: PowerShell unwraps cmdlet-produced PSObjects.
    # Credential-bearing input continues using the private .NET reader.
    return ConvertTo-Json -InputObject $Value -Depth 12 -Compress
}
Export-ModuleMember -Function Confirm-OwnedInstalledConfiguration,ConvertTo-OwnedInstalledPublicJson
