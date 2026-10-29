import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  writeFile,
  realpath,
  rm,
  readFile,
  readdir,
  rmdir,
} from 'node:fs/promises';
import { join, basename, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { physicalScancode } from '../../packages/protocol/dist/input.js';
import {
  windowsManagedFilesCommand,
  windowsManagedFilesScript,
  dispatchWindowsManagedFiles,
  parseWindowsFilesReceipt,
  readWindowsFilesLabInput,
} from '../../scripts/windows-managed-files-lab.mjs';

const id = '0123456789abcdef0123456789abcdef';
const target = {
  host: '192.168.56.30',
  port: 3389,
  testCertificateConfirmedByUser: true,
  fingerprint: 'sha256:' + 'a'.repeat(64),
};
const bytes = Buffer.from(
  Array.from({ length: 131111 }, (_, i) => (i * 31 + 17) & 255),
);
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
const created = {
  v: 1,
  id,
  phase: 'created',
  ok: true,
  bytes: 65599,
  readOnlyRefusals: 3,
  sha256: hash(bytes.subarray(0, 65599)),
};
const clean = {
  v: 1,
  id,
  phase: 'clean',
  ok: true,
  hostUploadBytes: 131111,
  readOnlySeedIntact: true,
};

test('Windows file bootstrap is bounded, target/pin checked and wipes consumed private bytes', async () => {
  const value = {
    id,
    ...target,
    workerPath: 'build/owned/rdp-worker.exe',
    workerSha256: 'a'.repeat(64),
    ipcTransport: 'framed-pipes',
    credentials: { username: 'synthetic', password: 'PRIVATE-test-password' },
  };
  const data = Buffer.from(JSON.stringify(value));
  assert.deepEqual(
    await readWindowsFilesLabInput(Readable.from([data])),
    value,
  );
  assert.ok(data.every((byte) => byte === 0));
  for (const invalid of [
    null,
    { ...value, host: 'other' },
    { ...value, port: 0 },
    { ...value, host: '8.8.8.8' },
    { ...value, testCertificateConfirmedByUser: false },
    { ...value, fingerprint: 'invalid' },
    { ...value, ipcTransport: 'other' },
    { ...value, workerSha256: 'bad' },
    {
      ...value,
      credentials: { username: 'synthetic', password: 'a'.repeat(4097) },
    },
    { ...value, credentials: { ...value.credentials, domain: 1 } },
  ]) {
    const input = Buffer.from(JSON.stringify(invalid));
    await assert.rejects(readWindowsFilesLabInput(Readable.from([input])), {
      message: 'FILES_LAB_INPUT_REFUSED',
    });
    assert.ok(input.every((byte) => byte === 0));
  }
  const oversized = Buffer.alloc(32769, 65);
  await assert.rejects(readWindowsFilesLabInput(Readable.from([oversized])), {
    message: 'FILES_LAB_INPUT_REFUSED',
  });
  assert.ok(oversized.every((byte) => byte === 0));
  await assert.rejects(
    readWindowsFilesLabInput(Readable.from([Buffer.from('{')])),
    { message: 'FILES_LAB_INPUT_REFUSED' },
  );
});

test(
  'Windows file runner refuses unconfirmed use and missing worker before any session or remote input',
  { timeout: 15000 },
  async () => {
    const ordinary = await mkdtemp(
      join(await realpath(tmpdir()), 'bridge-files-admission-'),
    );
    try {
      for (const diskFull of [false, true])
        for (const prepared of [false, true]) {
          const child = spawn(
            process.execPath,
            [
              'scripts/test-windows-managed-files.mjs',
              diskFull
                ? '--owned-windows-managed-files-full'
                : '--owned-windows-managed-files',
              ...(prepared ? ['--prepared-powershell'] : []),
            ],
            { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
          );
          const result = new Promise((done, reject) => {
            child.once('error', reject);
            child.once('close', done);
          });
          let output = '',
            diagnostic = '';
          child.stdout.on('data', (chunk) => {
            output += chunk.toString();
            if (output.length > 8192) child.kill();
          });
          child.stderr.on('data', (chunk) => {
            diagnostic += chunk.toString();
            if (diagnostic.length > 8192) child.kill();
          });
          child.stdin.on('error', () => {});
          child.stdin.end(
            JSON.stringify({
              id,
              ...target,
              ipcTransport: 'framed-pipes',
              ...(diskFull ? { fullRoot: ordinary } : {}),
              workerPath:
                'build/PRIVATE-nonexistent-owned-worker/rdp-worker.exe',
              workerSha256: 'a'.repeat(64),
              credentials: {
                username: 'synthetic',
                password: 'PRIVATE-test-password',
              },
            }),
          );
          const timer = setTimeout(() => child.kill(), 6000);
          try {
            assert.equal(await result, 1);
            assert.equal(diagnostic, '');
            assert.equal(output.includes('PRIVATE'), false);
            const events = output
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line));
            assert.equal(events[0].event, 'failed');
            assert.equal(
              events[0].phase,
              prepared && !diskFull ? 'worker-binding' : 'input',
            );
            if (prepared && diskFull)
              assert.equal(events[0].code, 'DISPOSABLE_FULL_ROOT_REFUSED');
            assert.deepEqual(events[1], { event: 'closed', clean: true });
            assert.equal(events.length, 2);
          } finally {
            clearTimeout(timer);
            if (child.exitCode === null) {
              child.kill();
              await result;
            }
          }
        }
    } finally {
      assert.deepEqual(await readdir(ordinary), []);
      await rmdir(ordinary);
    }
  },
);

test('owned Windows file command selects only its uploaded script and validated session alias', async () => {
  for (const value of [
    undefined,
    null,
    [],
    'a'.repeat(31),
    'A'.repeat(32),
    id + "';exit",
    '../' + id,
  ])
    assert.throws(
      () => windowsManagedFilesCommand(value),
      /FILES_LAB_ID_REFUSED/,
    );
  assert.equal(
    windowsManagedFilesCommand(id),
    "& ([scriptblock]::Create([IO.File]::ReadAllText('\\\\tsclient\\RW01234\\owned-check.ps1'))) '" +
      id +
      "'",
  );
  const source = await windowsManagedFilesScript();
  assert.ok(source.length > 2048 && source.length <= 16384);
  assert.match(source.toString(), /Get-OwnedPattern/);
  assert.equal(
    windowsManagedFilesCommand(id, true),
    windowsManagedFilesCommand(id) + ' -DiskFull',
  );
  for (const mode of [null, 0, 1, 'true', {}, []])
    assert.throws(
      () => windowsManagedFilesCommand(id, mode),
      /FILES_LAB_MODE_REFUSED/,
    );
});

test('Windows full-disk receipt binds identity, real Windows disk-full errno and bounded acknowledged blocks', () => {
  const full = {
    v: 1,
    id,
    phase: 'full',
    ok: true,
    errno: 112,
    acknowledgedBytes: 655360,
  };
  assert.deepEqual(
    parseWindowsFilesReceipt(
      JSON.stringify(full) + ' '.repeat(100),
      id,
      'full',
    ),
    full,
  );
  assert.equal(
    parseWindowsFilesReceipt(JSON.stringify({ ...full, errno: 39 }), id, 'full')
      .errno,
    39,
  );
  for (const invalid of [
    { ...full, id: 'b'.repeat(32) },
    { ...full, errno: 5 },
    { ...full, errno: 0 },
    { ...full, acknowledgedBytes: 0 },
    { ...full, acknowledgedBytes: 2097152 },
    { ...full, acknowledgedBytes: 65537 },
    { ...full, acknowledgedBytes: true },
    { ...full, extraPath: '/private' },
    { ...full, ok: false },
  ])
    assert.throws(
      () => parseWindowsFilesReceipt(JSON.stringify(invalid), id, 'full'),
      /FILES_LAB_RECEIPT_REFUSED/,
    );
});

test('Windows file input requires a confirmed private target and a user-prepared window before any input', async () => {
  let calls = 0;
  const send = async () => {
    calls++;
  };
  for (const endpoint of [
    undefined,
    {},
    { host: 'other' },
    { ...target, port: 0 },
    { ...target, host: '8.8.8.8' },
    { ...target, testCertificateConfirmedByUser: false },
    { ...target, fingerprint: 'bad' },
  ])
    await assert.rejects(
      dispatchWindowsManagedFiles(send, endpoint, id, true),
      /FILES_LAB_TARGET_REFUSED/,
    );
  for (const ready of [undefined, false, 'true', 1])
    await assert.rejects(
      dispatchWindowsManagedFiles(send, target, id, ready),
      /FILES_LAB_WINDOW_NOT_CONFIRMED/,
    );
  await assert.rejects(
    dispatchWindowsManagedFiles(send, target, 'bad', true),
    /FILES_LAB_ID_REFUSED/,
  );
  await assert.rejects(
    dispatchWindowsManagedFiles(send, target, id, true, async () => {}, 'true'),
    /FILES_LAB_MODE_REFUSED/,
  );
  assert.equal(calls, 0);
});

for (const diskFull of [false, true])
  test(`owned Windows file dispatch mode ${diskFull} reconstructs the exact US-layout command with balanced keys and no application launch`, async () => {
    const events = [],
      waits = [];
    await dispatchWindowsManagedFiles(
      async (value) => {
        events.push(value);
      },
      target,
      id,
      true,
      async (ms) => {
        waits.push(ms);
      },
      diskFull,
    );
    assert.deepEqual(events[0], { type: 'reset' });
    assert.deepEqual(events.at(-1), { type: 'reset' });
    assert.equal(
      events.some((event) => event.type === 'text'),
      false,
    );
    const table = new Map();
    for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')
      table.set(physicalScancode('Key' + char), [char.toLowerCase(), char]);
    for (const char of '0123456789')
      table.set(physicalScancode('Digit' + char), [
        char,
        { 0: ')', 7: '&', 9: '(' }[char],
      ]);
    for (const [code, plain, shifted] of [
      ['Space', ' '],
      ['BracketLeft', '['],
      ['BracketRight', ']'],
      ['Semicolon', ';', ':'],
      ['Period', '.'],
      ['Quote', "'"],
      ['Backslash', '\\'],
      ['Minus', '-'],
    ])
      table.set(physicalScancode(code), [plain, shifted]);
    let command = '',
      started = false;
    const heldForDecode = new Set();
    for (const event of events) {
      if (event.type !== 'key') continue;
      if (!event.down) {
        heldForDecode.delete(event.scancode);
        if (event.scancode === physicalScancode('ControlLeft')) started = true;
        continue;
      }
      heldForDecode.add(event.scancode);
      if (!started || event.scancode === physicalScancode('ShiftLeft'))
        continue;
      if (event.scancode === physicalScancode('Enter')) break;
      const char = table.get(event.scancode)?.[
        heldForDecode.has(physicalScancode('ShiftLeft')) ? 1 : 0
      ];
      assert.equal(typeof char, 'string');
      command += char;
    }
    assert.equal(command, windowsManagedFilesCommand(id, diskFull));
    assert.ok(events.length <= 4 * command.length + 20);
    assert.ok(waits.length >= command.length);
    const held = new Set();
    for (const event of events) {
      if (event.type === 'reset') held.clear();
      else if (event.type === 'key') {
        if (event.down) {
          assert.equal(held.has(event.scancode), false);
          held.add(event.scancode);
        } else assert.equal(held.delete(event.scancode), true);
      }
    }
    assert.equal(held.size, 0);
  });

test('failed Windows file input releases key state without disclosing the transport cause', async () => {
  const events = [];
  await assert.rejects(
    dispatchWindowsManagedFiles(
      async (event) => {
        events.push(event);
        if (
          event.type === 'key' &&
          event.scancode === physicalScancode('ShiftLeft') &&
          event.down
        )
          throw new Error('PRIVATE-transport-cause');
      },
      target,
      id,
      true,
      async () => {},
    ),
    { message: 'FILES_LAB_INPUT_FAILED' },
  );
  assert.deepEqual(events.at(-1), { type: 'reset' });
  assert.equal(
    events.some(
      (event) =>
        event.type === 'key' && event.scancode === physicalScancode('Enter'),
    ),
    false,
  );
});

test('Windows failure receipts expose only known phases and bounded scalar errno', () => {
  const value = { v: 1, id, phase: 'rename', ok: false, errno: 50 };
  assert.deepEqual(
    parseWindowsFilesReceipt(JSON.stringify(value), id, 'failed'),
    value,
  );
  for (const invalid of [
    { ...value, phase: 'arbitrary private message' },
    { ...value, errno: -1 },
    { ...value, errno: 65536 },
    { ...value, errno: 1.5 },
    { ...value, errno: '50' },
    { ...value, ok: true },
    { ...value, message: 'forbidden diagnostics' },
    { ...value, id: 'f'.repeat(32) },
  ])
    assert.throws(
      () => parseWindowsFilesReceipt(JSON.stringify(invalid), id, 'failed'),
      /FILES_LAB_RECEIPT_REFUSED/,
    );
  assert.throws(
    () => parseWindowsFilesReceipt(' '.repeat(2049), id, 'failed'),
    /FILES_LAB_RECEIPT_REFUSED/,
  );
});

test('Windows file receipts reject foreign identity, missing readback, extra fields and oversized input', () => {
  for (const [phase, value] of [
    ['created', created],
    ['clean', clean],
  ]) {
    assert.deepEqual(
      parseWindowsFilesReceipt(JSON.stringify(value), id, phase),
      value,
    );
    for (const invalid of [
      null,
      [],
      { ...value, id: 'a'.repeat(32) },
      { ...value, v: 2 },
      { ...value, ok: false },
      { ...value, phase: 'wrong' },
      { ...value, extra: 'PRIVATE-data' },
      {
        ...value,
        [phase === 'created' ? 'readOnlyRefusals' : 'readOnlySeedIntact']: 0,
      },
    ])
      assert.throws(
        () => parseWindowsFilesReceipt(JSON.stringify(invalid), id, phase),
        /FILES_LAB_RECEIPT_REFUSED/,
      );
    assert.throws(
      () => parseWindowsFilesReceipt(' '.repeat(2049), id, phase),
      /FILES_LAB_RECEIPT_REFUSED/,
    );
  }
  assert.throws(
    () => parseWindowsFilesReceipt(JSON.stringify(created), id, 'failed'),
    /FILES_LAB_RECEIPT_REFUSED/,
  );
  assert.throws(
    () =>
      parseWindowsFilesReceipt(
        JSON.stringify({ ...created, sha256: ['a'.repeat(64)] }),
        id,
        'created',
      ),
    /FILES_LAB_RECEIPT_REFUSED/,
  );
  assert.throws(
    () =>
      parseWindowsFilesReceipt(
        JSON.stringify({ ...created, bytes: 131111 }),
        id,
        'created',
      ),
    /FILES_LAB_RECEIPT_REFUSED/,
  );
  assert.throws(
    () =>
      parseWindowsFilesReceipt(
        JSON.stringify({ ...clean, hostUploadBytes: 0 }),
        id,
        'clean',
      ),
    /FILES_LAB_RECEIPT_REFUSED/,
  );
});

test(
  'PowerShell parses the owned fixture and independently verifies its pure pattern and command/refusal guards',
  { skip: process.platform !== 'win32' },
  () => {
    const path = fileURLToPath(
      new URL('../fixtures/windows-managed-files.ps1', import.meta.url),
    ).replaceAll("'", "''");
    const command = [
      "$ErrorActionPreference='Stop'",
      '$tokens=$null; $errors=$null',
      "$ast=[Management.Automation.Language.Parser]::ParseFile('" +
        path +
        "',[ref]$tokens,[ref]$errors)",
      "if($errors.Count -ne 0){throw 'OWNED_PARSE_FAILED'}",
      "$names=@('Get-OwnedPattern','Get-OwnedHash','Assert-OwnedCommand','Assert-OwnedDenied')",
      '$functions=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -in $names},$true)',
      "if($functions.Count -ne 4){throw 'OWNED_FUNCTIONS'}",
      'foreach($function in $functions){. ([scriptblock]::Create($function.Extent.Text))}',
      '$bytes=Get-OwnedPattern',
      "if($bytes.GetType() -ne [byte[]]){throw 'OWNED_TYPE'}",
      "$id='" + id + "'",
      "Assert-OwnedCommand ([pscustomobject]@{id=$id;command='cleanup'}) $id",
      '$refused=0',
      "foreach($value in @($null,[pscustomobject]@{id=$id},[pscustomobject]@{id='wrong';command='cleanup'},[pscustomobject]@{id=$id;command='cleanup';extra=1},[pscustomobject]@{id=$id;command='other'})){",
      "  try{Assert-OwnedCommand $value $id;throw 'OWNED_ACCEPTED'}",
      "  catch{if($_.Exception.Message -ne 'OWNED_COMMAND'){throw};$refused++}",
      '}',
      "Assert-OwnedDenied {throw [UnauthorizedAccessException]::new('synthetic')}",
      '$wrongRefusals=0',
      "foreach($operation in @({},{throw [IO.FileNotFoundException]::new('synthetic')})){",
      "  try{Assert-OwnedDenied $operation;throw 'OWNED_ACCEPTED'}",
      "  catch{if($_.Exception.Message -notin @('OWNED_WRITE_ALLOWED','OWNED_WRONG_REFUSAL')){throw};$wrongRefusals++}",
      '}',
      '@{patternBytes=$bytes.Length;sha256=(Get-OwnedHash $bytes);commandRefusals=$refused;wrongRefusals=$wrongRefusals}|ConvertTo-Json -Compress',
    ].join('\n');
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 4096,
      },
    );
    assert.deepEqual(JSON.parse(output), {
      patternBytes: bytes.length,
      sha256: hash(bytes),
      commandRefusals: 5,
      wrongRefusals: 2,
    });
  },
);

test(
  'owned PowerShell reader returns exact bytes, closes handles and refuses size bounds',
  { skip: process.platform !== 'win32' },
  async () => {
    const parent = await realpath(tmpdir());
    const directory = await mkdtemp(join(parent, 'bridge-files-unit-'));
    const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
    try {
      const source = fileURLToPath(
        new URL('../fixtures/windows-managed-files.ps1', import.meta.url),
      );
      const file = join(directory, 'owned.bin'),
        large = join(directory, 'large.bin');
      await writeFile(file, bytes);
      await writeFile(large, Buffer.alloc(131112));
      const command = [
        "$ErrorActionPreference='Stop'; $tokens=$null; $errors=$null",
        '$ast=[Management.Automation.Language.Parser]::ParseFile(' +
          literal(source) +
          ',[ref]$tokens,[ref]$errors)',
        "if($errors.Count -ne 0){throw 'OWNED_PARSE'}",
        "$functions=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -in @('Read-Owned','Get-OwnedHash')},$true)",
        "if($functions.Count -ne 2){throw 'OWNED_FUNCTIONS'}",
        'foreach($function in $functions){. ([scriptblock]::Create($function.Extent.Text))}',
        '$path=' + literal(file),
        '$large=' + literal(large),
        '$bytes=Read-Owned $path 131111',
        "if($bytes.GetType() -ne [byte[]]){throw 'OWNED_TYPE'}",
        '$refused=0',
        'foreach($size in @(0, -1, 131112, 131110)){',
        "try{Read-Owned $path $size|Out-Null;throw 'OWNED_ACCEPTED'}catch{if($_.Exception.Message -ne 'OWNED_BOUND'){throw};$refused++}",
        '}',
        "try{Read-Owned $large 131111|Out-Null;throw 'OWNED_ACCEPTED'}catch{if($_.Exception.Message -ne 'OWNED_BOUND'){throw};$refused++}",
        '$handle=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$handle.Dispose()',
        '$handle=[IO.File]::Open($large,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$handle.Dispose()',
        '@{bytes=$bytes.Length;sha256=(Get-OwnedHash $bytes);refused=$refused}|ConvertTo-Json -Compress',
      ].join('\n');
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 4096,
        },
      );
      assert.deepEqual(JSON.parse(output), {
        bytes: 131111,
        sha256: hash(bytes),
        refused: 5,
      });
    } finally {
      const target = await realpath(directory);
      assert.ok(
        target.startsWith(parent + sep) &&
          basename(target).startsWith('bridge-files-unit-'),
      );
      await rm(target, { recursive: true });
    }
  },
);

test(
  'reserved Windows full-volume receipts overwrite only their existing fixed pages and refuse size, growth and sharing violations',
  { skip: process.platform !== 'win32', timeout: 20000 },
  async () => {
    const parent = await realpath(tmpdir());
    const directory = await mkdtemp(join(parent, 'bridge-files-receipt-'));
    const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
    try {
      await writeFile(
        join(directory, 'receipt-full.json'),
        Buffer.alloc(2048, 32),
      );
      await writeFile(
        join(directory, 'receipt-failed.json'),
        Buffer.alloc(64, 88),
      );
      const source = fileURLToPath(
        new URL('../fixtures/windows-managed-files.ps1', import.meta.url),
      );
      const command = [
        "$ErrorActionPreference='Stop'; $tokens=$null; $errors=$null",
        '$ast=[Management.Automation.Language.Parser]::ParseFile(' +
          literal(source) +
          ',[ref]$tokens,[ref]$errors)',
        "if($errors.Count){throw 'PARSE'}",
        "$function=$ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Write-OwnedReservedReceipt'},$true)",
        "if($function.Count -ne 1){throw 'FUNCTION'}",
        '. ([scriptblock]::Create($function[0].Extent.Text))',
        '$rw=' + literal(directory),
        "$value=@{v=1;id='" +
          id +
          "';phase='full';ok=$true;errno=112;acknowledgedBytes=655360}",
        "Write-OwnedReservedReceipt 'receipt-full.json' $value",
        "$refused=0; try { Write-OwnedReservedReceipt 'receipt-failed.json' $value; throw 'ALLOWED' } catch { if($_.Exception.Message -cne 'OWNED_RESERVED_RECEIPT'){throw}; $refused++ }",
        "$check=[IO.File]::Open((Join-Path $rw 'receipt-failed.json'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); $check.Dispose()",
        "try { Write-OwnedReservedReceipt 'receipt-full.json' @{extra=('x'*3000)}; throw 'ALLOWED' } catch { if($_.Exception.Message -cne 'OWNED_BOUND'){throw}; $refused++ }",
        "$reader=[IO.File]::Open((Join-Path $rw 'receipt-full.json'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)",
        "try { try { Write-OwnedReservedReceipt 'receipt-full.json' $value; throw 'ALLOWED' } catch { if($_.Exception.Message -cne 'OWNED_RECEIPT_BUSY'){throw}; $refused++ } } finally { $reader.Dispose() }",
        "Write-OwnedReservedReceipt 'receipt-full.json' $value",
        '@{refusals=$refused;closed=$true}|ConvertTo-Json -Compress',
      ].join('; ');
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 8192,
        },
      );
      assert.deepEqual(JSON.parse(output), { refusals: 3, closed: true });
      const receipt = await readFile(join(directory, 'receipt-full.json'));
      assert.equal(receipt.length, 2048);
      assert.equal(
        parseWindowsFilesReceipt(receipt.toString('utf8'), id, 'full').errno,
        112,
      );
      assert.deepEqual(
        await readFile(join(directory, 'receipt-failed.json')),
        Buffer.alloc(64, 88),
      );
      assert.deepEqual((await readdir(directory)).sort(), [
        'receipt-failed.json',
        'receipt-full.json',
      ]);
    } finally {
      assert.equal(await realpath(directory), directory);
      assert.ok(directory.startsWith(parent + sep));
      assert.match(basename(directory), /^bridge-files-receipt-/);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
