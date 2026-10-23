param(
  [Parameter(Mandatory=$true)][string]$MsiPath,
  [Parameter(Mandatory=$true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
$resolvedMsi = (Resolve-Path -LiteralPath $MsiPath).Path
if ((Get-Item -LiteralPath $resolvedMsi).Length -gt 536870912) { throw 'MSI input exceeds inspection bound' }
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $null
try {
  $database = $installer.OpenDatabase($resolvedMsi, 0)
  $tables = @('Property', 'ServiceInstall', 'ServiceControl', 'MsiLockPermissionsEx', 'CreateFolder', 'Wix4ServiceConfig', 'InstallExecuteSequence', 'CustomAction', 'File', 'Component', 'Directory', 'Upgrade', 'LaunchCondition')
  $result = [ordered]@{}
  foreach ($table in $tables) {
    $view = $database.OpenView('SELECT * FROM `' + $table + '`')
    $columns = $null
    try {
      $view.Execute()
      $columns = $view.ColumnInfo(0)
      $rows = New-Object 'System.Collections.Generic.List[object]'
      while ($record = $view.Fetch()) {
        try {
          if ($rows.Count -ge 20000) { throw 'MSI table exceeds inspection bound' }
          $row = [ordered]@{}
          $count = $record.GetType().InvokeMember('FieldCount', [Reflection.BindingFlags]::GetProperty, $null, $record, $null)
          if ($count -gt 32) { throw 'MSI column count exceeds inspection bound' }
          for ($column = 1; $column -le $count; $column++) {
            $value = $record.StringData($column)
            if ($value.Length -gt 65536) { throw 'MSI field exceeds inspection bound' }
            $row[$columns.StringData($column)] = $value
          }
          $rows.Add($row)
        } finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($record) }
      }
      $result[$table] = @($rows.ToArray())
    } finally {
      $view.Close()
      if ($columns) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($columns) }
      [void][Runtime.InteropServices.Marshal]::ReleaseComObject($view)
    }
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8
} finally {
  if ($database) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($database) }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($installer)
}
