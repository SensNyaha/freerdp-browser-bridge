import { createHash } from 'node:crypto';

const fail = () => {
  throw new Error('STANDALONE_MSI_MANIFEST_INVALID');
};
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character],
  );
const id = (prefix, path) =>
  prefix + createHash('sha256').update(path).digest('hex').slice(0, 32);
const aclRead = 'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;LS)';
const aclRuntime = 'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;LS)';

/** Render only an inventoried immutable payload; no harvesting or custom shell. */
export function standaloneWindowsMsi({ version, files, development = false }) {
  if (
    typeof version !== 'string' ||
    !/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version) ||
    version.length > 32 ||
    !Array.isArray(files) ||
    files.length < 5 ||
    files.length > 10000 ||
    version
      .split('.')
      .some((value, index) => Number(value) > (index < 2 ? 255 : 65535))
  )
    fail();
  const paths = new Set();
  let total = 0;
  const root = { directories: new Map(), files: [] };
  for (const file of files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      file.path.length > 220 ||
      file.path.startsWith('/') ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      file.bytes > 536870912
    )
      fail();
    const parts = file.path.split('/');
    if (
      parts.some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[<>:"\\|?*\x00-\x1f$]/.test(part) ||
          /[ .]$/.test(part) ||
          /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part),
      )
    )
      fail();
    const key = file.path.toLowerCase();
    if (paths.has(key) || (total += file.bytes) > 1073741824) fail();
    paths.add(key);
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      if (!parent.directories.has(part))
        parent.directories.set(part, { directories: new Map(), files: [] });
      parent = parent.directories.get(part);
    }
    parent.files.push(file);
  }
  for (const required of [
    'bridge-service.exe',
    'node/node.exe',
    'node/LICENSE',
    'service/package.json',
    'service/dist/main.js',
    'bridge.example.json',
  ])
    if (!files.some((file) => file.path === required)) fail();
  const directories = new Map();
  for (const file of files) {
    const parts = file.path.split('/');
    for (let depth = 1; depth < parts.length; ++depth) {
      const directory = parts.slice(0, depth).join('/');
      const key = directory.toLowerCase();
      if (
        paths.has(key) ||
        (directories.has(key) && directories.get(key) !== directory)
      )
        fail();
      directories.set(key, directory);
    }
  }
  const components = [];
  const render = (tree, prefix = '') => {
    const lines = [];
    for (const file of tree.files.sort((left, right) =>
      left.path.localeCompare(right.path, 'en'),
    )) {
      const component = id('C', file.path);
      components.push(component);
      const source = '$(var.PayloadRoot)\\' + file.path.replaceAll('/', '\\');
      const service =
        file.path === 'bridge-service.exe'
          ? `
        <ServiceInstall Id="BridgeService" Name="FreeRDPBridge" DisplayName="FreeRDP Bridge" Description="Browser RDP bridge service" Type="ownProcess" Start="auto" ErrorControl="normal" Account="NT AUTHORITY\\LocalService" Arguments="--config &quot;[DATADIR]config\\bridge.json&quot; --runtime-root &quot;[DATADIR]runtime&quot;">
          <util:ServiceConfig FirstFailureActionType="restart" SecondFailureActionType="restart" ThirdFailureActionType="none" RestartServiceDelayInSeconds="5" ResetPeriodInDays="1" />
        </ServiceInstall>
        <ServiceControl Id="BridgeControl" Name="FreeRDPBridge" Start="install" Stop="both" Remove="uninstall" Wait="yes" />`
          : '';
      lines.push(
        `<Component Id="${component}" Guid="*" Bitness="always64"><File Id="${id('F', file.path)}" Source="${xml(source)}" Name="${xml(file.path.split('/').at(-1))}" KeyPath="yes" />${service}</Component>`,
      );
    }
    for (const [name, child] of [...tree.directories].sort(([left], [right]) =>
      left.localeCompare(right, 'en'),
    )) {
      const path = prefix ? prefix + '/' + name : name;
      lines.push(
        `<Directory Id="${id('D', path)}" Name="${xml(name)}">${render(child, path)}</Directory>`,
      );
    }
    return lines.join('\n');
  };
  const payload = render(root);
  const upgrade = development
    ? 'F0598732-954E-4FD4-BF3D-946962687008'
    : 'A06AFCCA-3B34-42B3-93B6-BB0900E1F295';
  return `<?xml version="1.0" encoding="utf-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs" xmlns:util="http://wixtoolset.org/schemas/v4/wxs/util">
  <Package Name="FreeRDP Bridge${development ? ' Development' : ''}" Manufacturer="FreeRDP Bridge" Version="${xml(version)}" UpgradeCode="${upgrade}" Scope="perMachine" InstallerVersion="500" Language="1033" Compressed="yes">
    <MajorUpgrade DowngradeErrorMessage="A newer FreeRDP Bridge is already installed." Schedule="afterInstallInitialize" />
    <MediaTemplate EmbedCab="yes" CompressionLevel="high" />
    <Property Id="BRIDGEWINDOWSBUILD"><RegistrySearch Id="WindowsBuildNumber" Root="HKLM" Key="SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" Name="CurrentBuildNumber" Type="raw" Bitness="always64" /></Property>
    <Launch Condition="VersionNT64 AND BRIDGEWINDOWSBUILD &gt;= 10240" Message="Windows 10 / Server 2016 x64 or later is required." />
    <Property Id="EXISTINGBRIDGESERVICE"><RegistrySearch Id="ExistingBridge" Root="HKLM" Key="SYSTEM\\CurrentControlSet\\Services\\FreeRDPBridge" Name="ImagePath" Type="raw" Bitness="always64" /></Property>
    <Launch Condition="Installed OR WIX_UPGRADE_DETECTED OR NOT EXISTINGBRIDGESERVICE" Message="An existing FreeRDPBridge service is managed by another installation." />
    <StandardDirectory Id="ProgramFiles64Folder"><Directory Id="INSTALLDIR" Name="FreeRDP Bridge">
      <Component Id="ProgramPermissions" Guid="A06AFCCA-3B34-42B3-93B6-BB0900E1F296" Bitness="always64"><CreateFolder><PermissionEx Sddl="D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)(A;OICI;0x1200a9;;;LS)" /></CreateFolder></Component>
      ${payload}
    </Directory></StandardDirectory>
    <StandardDirectory Id="CommonAppDataFolder"><Directory Id="DATADIR" Name="FreeRDPBridge">
      <Component Id="DataPermissions" Guid="A06AFCCA-3B34-42B3-93B6-BB0900E1F297" Bitness="always64"><CreateFolder><PermissionEx Sddl="${aclRead}" /></CreateFolder></Component>
      <Directory Id="CONFIGDIR" Name="config"><Component Id="PublicConfiguration" Guid="*" Bitness="always64" Permanent="yes" NeverOverwrite="yes">
        <CreateFolder><PermissionEx Sddl="${aclRead}" /></CreateFolder>
        <File Id="PublicConfig" Source="$(var.PayloadRoot)\\bridge.example.json" Name="bridge.json" KeyPath="yes"><PermissionEx Sddl="D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;LS)" /></File>
      </Component></Directory>
      <Directory Id="RUNTIMEDIR" Name="runtime"><Component Id="RuntimePermissions" Guid="A06AFCCA-3B34-42B3-93B6-BB0900E1F298" Bitness="always64"><CreateFolder><PermissionEx Sddl="${aclRuntime}" /></CreateFolder></Component></Directory>
    </Directory></StandardDirectory>
    <Feature Id="Service" Title="Standalone web service" Level="1"><ComponentRef Id="ProgramPermissions" /><ComponentRef Id="DataPermissions" /><ComponentRef Id="PublicConfiguration" /><ComponentRef Id="RuntimePermissions" />${components.map((component) => `<ComponentRef Id="${component}" />`).join('')}</Feature>
  </Package>
</Wix>
`;
}
