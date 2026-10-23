import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyStandaloneMsi } from '../../scripts/standalone/verify-msi.mjs';

const root = process.env.BRIDGE_MSI_TEST_ROOT;
async function inputs() {
  const json = async (file) =>
    JSON.parse(
      (await readFile(join(root, file), 'utf8')).replace(/^\uFEFF/, ''),
    );
  return {
    tables: await json('tables-final.json'),
    inventory: await json('payload.json'),
    extracted: (await json('archive-extract.json')).target,
  };
}
test(
  'actual standalone MSI database and extracted cabinet match policy and every inventoried byte',
  { skip: !root },
  async () => {
    const input = await inputs();
    const verified = await verifyStandaloneMsi(input);
    assert.equal(verified.files, input.inventory.files.length + 1);
    assert.equal(verified.exactCabinetBytes, true);
    assert.equal(verified.installationAccepted, false);
  },
);
test(
  'actual standalone MSI verification detects privilege, ACL, configuration preservation, extra action and cabinet drift',
  { skip: !root },
  async () => {
    const baseline = await inputs();
    for (const mutate of [
      (input) => {
        input.tables.ServiceInstall[0].StartName = 'LocalSystem';
      },
      (input) => {
        input.tables.MsiLockPermissionsEx[0].SDDLText = 'D:(A;;FA;;;WD)';
      },
      (input) => {
        input.tables.Component.find(
          (row) => row.Component === 'PublicConfiguration',
        ).Attributes = '256';
      },
      (input) => {
        input.tables.CustomAction.push({
          Action: 'UnexpectedShell',
          Type: '34',
          Source: 'INSTALLDIR',
          Target: 'cmd.exe',
        });
      },
      (input) => {
        input.tables.File.pop();
      },
      (input) => {
        input.inventory.files.find(
          (file) => file.path === 'bridge-service.exe',
        ).sha256 = '0'.repeat(64);
      },
    ]) {
      const input = structuredClone(baseline);
      mutate(input);
      await assert.rejects(verifyStandaloneMsi(input));
    }
  },
);
