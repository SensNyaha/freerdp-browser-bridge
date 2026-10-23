import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readStandalonePayloadFile } from './payload.mjs';
import { join } from 'node:path';
import { standaloneWindowsMsi } from './windows-msi.mjs';

/** Check actual database rows and independently extracted cabinet bytes. */
export async function verifyStandaloneMsi({ tables, inventory, extracted }) {
  standaloneWindowsMsi({ version: inventory.version, files: inventory.files });
  const properties = new Map(
    tables.Property.map((row) => [row.Property, row.Value]),
  );
  assert.equal(properties.get('ProductVersion'), inventory.version);
  assert.equal(properties.get('ALLUSERS'), '1');
  assert.equal(tables.ServiceInstall.length, 1);
  const service = tables.ServiceInstall[0];
  assert.equal(service.Name, 'FreeRDPBridge');
  assert.equal(service.StartName, 'NT AUTHORITY\\LocalService');
  assert.equal(service.Password, '');
  assert.equal(service.ServiceType, '16');
  assert.equal(service.StartType, '2');
  assert.equal(
    service.Arguments,
    '--config "[DATADIR]config\\bridge.json" --runtime-root "[DATADIR]runtime"',
  );
  assert.equal(tables.ServiceControl.length, 1);
  assert.equal(tables.ServiceControl[0].Event, '163');
  assert.equal(tables.ServiceControl[0].Wait, '1');
  assert.equal(tables.Wix4ServiceConfig.length, 1);
  const recovery = tables.Wix4ServiceConfig[0];
  assert.equal(recovery.FirstFailureActionType, 'restart');
  assert.equal(recovery.SecondFailureActionType, 'restart');
  assert.equal(recovery.ThirdFailureActionType, 'none');
  assert.equal(recovery.RestartServiceDelayInSeconds, '5');
  assert.equal(recovery.ProgramCommandLine, '');
  const customActions = [
    {
      Action: 'Wix4SchedServiceConfig_X64',
      Type: '1',
      Source: 'Wix4UtilCA_X64',
      Target: 'SchedServiceConfig',
      ExtendedType: '',
    },
    {
      Action: 'Wix4ExecServiceConfig_X64',
      Type: '3073',
      Source: 'Wix4UtilCA_X64',
      Target: 'ExecServiceConfig',
      ExtendedType: '',
    },
    {
      Action: 'Wix4RollbackServiceConfig_X64',
      Type: '3329',
      Source: 'Wix4UtilCA_X64',
      Target: 'RollbackServiceConfig',
      ExtendedType: '',
    },
  ];
  const byAction = (left, right) =>
    left.Action.localeCompare(right.Action, 'en');
  assert.deepEqual(
    [...tables.CustomAction].sort(byAction),
    customActions.sort(byAction),
  );
  const expectedAcls = new Map([
    [
      'INSTALLDIR',
      'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)(A;OICI;0x1200a9;;;LS)',
    ],
    ['DATADIR', 'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;LS)'],
    ['CONFIGDIR', 'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;LS)'],
    ['RUNTIMEDIR', 'D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;LS)'],
    ['PublicConfig', 'D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;LS)'],
  ]);
  assert.equal(tables.MsiLockPermissionsEx.length, expectedAcls.size);
  for (const acl of tables.MsiLockPermissionsEx) {
    assert.equal(acl.SDDLText, expectedAcls.get(acl.LockObject));
    assert.equal(
      acl.Table,
      acl.LockObject === 'PublicConfig' ? 'File' : 'CreateFolder',
    );
    expectedAcls.delete(acl.LockObject);
  }
  assert.equal(expectedAcls.size, 0);
  const components = new Map(
    tables.Component.map((row) => [row.Component, row]),
  );
  const config = components.get('PublicConfiguration');
  assert.ok(
    (Number(config.Attributes) & (16 | 128 | 256)) === (16 | 128 | 256),
  );
  assert.equal(config.KeyPath, 'PublicConfig');
  const directories = new Map(
    tables.Directory.map((row) => [row.Directory, row]),
  );
  const name = (value) => value.split('|').at(-1);
  const paths = new Map(inventory.files.map((file) => [file.path, file]));
  const remaining = new Set(paths.keys());
  assert.equal(tables.File.length, paths.size + 1);
  let checked = 0;
  for (const file of tables.File) {
    assert.match(file.File, /^[A-Za-z_][A-Za-z0-9_.]*$/);
    let path;
    if (file.File === 'PublicConfig') path = 'bridge.example.json';
    else {
      const parts = [name(file.FileName)];
      let directory = components.get(file.Component_).Directory_;
      let depth = 0;
      while (directory !== 'INSTALLDIR') {
        assert.ok(++depth <= 32);
        const row = directories.get(directory);
        assert.ok(row);
        parts.unshift(name(row.DefaultDir));
        directory = row.Directory_Parent;
      }
      path = parts.join('/');
    }
    const expected = paths.get(path);
    assert.ok(expected);
    assert.equal(Number(file.FileSize), expected.bytes);
    const bytes = await readStandalonePayloadFile(
      join(extracted, file.File),
      536870912,
    );
    assert.equal(bytes.length, expected.bytes);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      expected.sha256,
    );
    ++checked;
    if (file.File !== 'PublicConfig') {
      assert.ok(remaining.delete(path));
    }
  }
  assert.equal(remaining.size, 0);
  const serviceComponent = components.get(service.Component_);
  assert.equal(serviceComponent.Directory_, 'INSTALLDIR');
  assert.ok(
    tables.File.some(
      (file) =>
        file.File === serviceComponent.KeyPath &&
        name(file.FileName) === 'bridge-service.exe',
    ),
  );
  return {
    files: checked,
    databasePolicy: true,
    exactCabinetBytes: true,
    installationAccepted: false,
  };
}
