import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

test(
  'native toolchain integration: stable MSVC PATH links SDK/STL and preserves vcpkg root',
  { skip: process.platform !== 'win32', timeout: 45000 },
  async () => {
    const execute = promisify(execFile);
    const vswhere = join(
      process.env['ProgramFiles(x86)'],
      'Microsoft Visual Studio',
      'Installer',
      'vswhere.exe',
    );
    const { stdout } = await execute(vswhere, [
      '-latest',
      '-products',
      '*',
      '-requires',
      'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
      '-property',
      'installationPath',
    ]);
    const visualStudio = stdout.trim();
    assert.ok(visualStudio);
    const git = (await execute('where.exe', ['git.exe'])).stdout
      .trim()
      .split(/\r?\n/)[0];
    assert.ok(git);
    const directory = await mkdtemp(join(tmpdir(), 'bridge-msvc-env-'));
    try {
      await writeFile(
        join(directory, 'probe.cpp'),
        '#include <windows.h>\n#include <vector>\nint main() { std::vector<DWORD> ids{GetCurrentProcessId()}; return ids[0] == 0; }\n',
      );
      await writeFile(
        join(directory, 'verify.mjs'),
        "import { createHash } from 'node:crypto';\nif (process.env.VCPKG_ROOT !== 'bridge-env-fixture') process.exit(3);\nconsole.log('BRIDGE_MSVC_ENV_VERIFIED ' + createHash('sha256').update(process.env.PATH).digest('hex'));\n",
      );
      const setup = resolve('scripts/msvc-env.cmd');
      const command = `call "${setup}" "${visualStudio}" "${dirname(git)}" && cl /nologo /EHsc probe.cpp /Feprobe.exe >nul && probe.exe && git --version >nul && cmake --version >nul && "${process.execPath}" verify.mjs`;
      let previous;
      for (const temporarySuffix of ['caller-one', 'caller-two']) {
        const env = { ...process.env, VCPKG_ROOT: 'bridge-env-fixture' };
        const pathKey = Object.keys(env).find(
          (key) => key.toLowerCase() === 'path',
        );
        assert.ok(pathKey);
        env[pathKey] = `${join(directory, temporarySuffix)};${env[pathKey]}`;
        const result = await execute(
          'cmd.exe',
          ['/d', '/s', '/c', `"${command}"`],
          {
            cwd: directory,
            windowsHide: true,
            windowsVerbatimArguments: true,
            env,
          },
        );
        const hash = /BRIDGE_MSVC_ENV_VERIFIED ([a-f0-9]{64})/.exec(
          result.stdout,
        )?.[1];
        assert.ok(hash);
        if (previous) assert.equal(hash, previous);
        previous = hash;
      }
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
