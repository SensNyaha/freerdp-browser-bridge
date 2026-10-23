import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';

test('pinned DSP build-copy refuses missing, oversized and changed source without modifying output', async () => {
  const root = await mkdtemp(resolve('build/dsp-override-guard-'));
  assert.ok(root.startsWith(resolve('build') + sep));
  try {
    const input = resolve(root, 'dsp.c');
    const output = resolve(root, 'result.c');
    const driver = resolve(root, 'guard.cmake');
    await writeFile(
      driver,
      'include("${OVERRIDE_RECIPE}")\nbridge_write_dsp_override("${OVERRIDE_INPUT}" "${OVERRIDE_OUTPUT}")\n',
    );
    await writeFile(output, 'existing output');
    for (const [content, diagnostic] of [
      [undefined, 'must be a regular file'],
      ['x'.repeat(131073), 'exceeds its bound'],
      ['unrecognized upstream source\n', 'hash mismatch'],
    ]) {
      if (content !== undefined) await writeFile(input, content);
      const result = spawnSync(
        'cmake',
        [
          '-DOVERRIDE_RECIPE=' + resolve('native/freerdp-dsp-override.cmake'),
          '-DOVERRIDE_INPUT=' + input,
          '-DOVERRIDE_OUTPUT=' + output,
          '-P',
          driver,
        ],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000,
          maxBuffer: 65536,
        },
      );
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(diagnostic), result.stderr);
      assert.equal(await readFile(output, 'utf8'), 'existing output');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pinned SDK override admission requires bounded metadata for the current source, recipe and generated code', async () => {
  const root = await mkdtemp(resolve('build/dsp-sdk-guard-'));
  assert.ok(root.startsWith(resolve('build') + sep));
  try {
    const recipe = resolve('native/freerdp-dsp-override.cmake');
    const recipeHash = createHash('sha256')
      .update((await readFile(recipe, 'utf8')).replaceAll('\r\n', '\n'))
      .digest('hex');
    const valid = {
      schema: 1,
      id: 'dsp-opus-reset-ownership-v1',
      sourceCommit: 'bf217a504e54cc719880c228e82353382cd7d4fa',
      sourceSha256:
        '40715894dc14e2869c64bbf3ebfcf209fe12483890ffb709133d7034f32ad10f',
      recipeSha256: recipeHash,
      outputSha256:
        'f1da137622368914628be9ef79888186bb6a9a1dc7e5fa77771535c061dae35a',
    };
    const directory = resolve(root, 'share/freerdp-bridge');
    await mkdir(directory, { recursive: true });
    const manifest = resolve(directory, 'freerdp-overrides.json');
    const driver = resolve(root, 'guard.cmake');
    await writeFile(
      driver,
      'include("${OVERRIDE_RECIPE}")\nbridge_require_freerdp_overrides("${OVERRIDE_PREFIX}")\n',
    );
    for (const [data, diagnostic] of [
      [undefined, 'Rebuild the pinned FreeRDP SDK'],
      ['{', 'Invalid pinned FreeRDP override metadata'],
      [' '.repeat(4097), 'exceeds its bound'],
      [{ ...valid, schema: 2 }, 'override mismatch'],
      [{ ...valid, id: 'unknown' }, 'override mismatch'],
      [{ ...valid, sourceCommit: '0'.repeat(40) }, 'override mismatch'],
      [{ ...valid, recipeSha256: '0'.repeat(64) }, 'override mismatch'],
      [{ ...valid, outputSha256: '0'.repeat(64) }, 'override mismatch'],
      [valid, undefined],
    ]) {
      if (data !== undefined)
        await writeFile(
          manifest,
          typeof data === 'string' ? data : JSON.stringify(data),
        );
      const result = spawnSync(
        'cmake',
        [
          '-DOVERRIDE_RECIPE=' + recipe,
          '-DOVERRIDE_PREFIX=' + root,
          '-P',
          driver,
        ],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000,
          maxBuffer: 65536,
        },
      );
      assert.equal(
        result.status,
        diagnostic === undefined ? 0 : 1,
        result.stderr,
      );
      if (diagnostic !== undefined)
        assert.ok(result.stderr.includes(diagnostic), result.stderr);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
