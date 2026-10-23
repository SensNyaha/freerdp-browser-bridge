param([string]$Username = 'admin')

$workspacePath = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$labDirectory = Join-Path $workspacePath '.local-tests'
New-Item -ItemType Directory -Path $labDirectory -Force | Out-Null
$labIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$labAcl = New-Object System.Security.AccessControl.DirectorySecurity
$labAcl.SetOwner($labIdentity.User)
$labAcl.SetAccessRuleProtection($true, $false)
$labRule = New-Object System.Security.AccessControl.FileSystemAccessRule($labIdentity.User, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$labAcl.AddAccessRule($labRule)
Set-Acl -LiteralPath $labDirectory -AclObject $labAcl

# Secure interactive input: never accept a password argument, environment variable or plaintext file.
$labCredential = Get-Credential -UserName $Username -Message 'XRDP test lab: encrypt the password for the current Windows account'
if (!$labCredential) { throw 'Credential entry cancelled; no password saved' }
try {
  $labCredential | Export-Clixml -LiteralPath (Join-Path $labDirectory 'xrdp-lab.credential.clixml')
  $labLoaded = Import-Clixml -LiteralPath (Join-Path $labDirectory 'xrdp-lab.credential.clixml')
  try {
    if ($labLoaded.UserName -ne $labCredential.UserName -or $labLoaded.Password.Length -eq 0) {
      throw 'Encrypted credential verification failed'
    }
  } finally { $labLoaded.Password.Dispose() }
  $labConfigPath = Join-Path $labDirectory 'xrdp-lab.json'
  if (Test-Path -LiteralPath $labConfigPath) {
    $labConfig = Get-Content -LiteralPath $labConfigPath -Raw | ConvertFrom-Json
    $labConfig.username = $labCredential.UserName
    $labConfig.credentialStatus = 'stored with Windows DPAPI'
    $labConfig | ConvertTo-Json | Set-Content -LiteralPath $labConfigPath -Encoding UTF8
  }
  Write-Output 'XRDP credential saved with Windows DPAPI in ignored .local-tests.'
} finally { $labCredential.Password.Dispose() }
