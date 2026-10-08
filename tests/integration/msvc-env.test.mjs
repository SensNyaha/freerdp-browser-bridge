import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

test(
  'native toolchain integration: static MSVC setup links SDK/STL and preserves vcpkg root',
  { skip: process.platform !== 'win32', timeout: 30000 },
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
    const directory = await mkdtemp(join(tmpdir(), 'bridge-msvc-env-'));
    try {
      await writeFile(
        join(directory, 'probe.cpp'),
        '#include <windows.h>\n#include <vector>\nint main() { std::vector<DWORD> ids{GetCurrentProcessId()}; return ids[0] == 0; }\n',
      );
      await writeFile(
        join(directory, 'verify.mjs'),
        "if (process.env.VCPKG_ROOT !== 'bridge-env-fixture') process.exit(3);\nconsole.log('BRIDGE_MSVC_ENV_VERIFIED');\n",
      );
      const setup = resolve('scripts/msvc-env.cmd');
      const command = `call "${setup}" "${visualStudio}" && cl /nologo /EHsc probe.cpp /Feprobe.exe >nul && probe.exe && "${process.execPath}" verify.mjs`;
      const result = await execute(
        'cmd.exe',
        ['/d', '/s', '/c', `"${command}"`],
        {
          cwd: directory,
          windowsHide: true,
          windowsVerbatimArguments: true,
          env: { ...process.env, VCPKG_ROOT: 'bridge-env-fixture' },
        },
      );
      assert.match(result.stdout, /BRIDGE_MSVC_ENV_VERIFIED/);
    } finally {
      await rm(directory, { recursive: true, force: true, maxRetries: 3 });
    }
  },
);
