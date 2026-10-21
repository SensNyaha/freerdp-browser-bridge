import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  encodeInputText,
  physicalScancode,
} from '../../packages/protocol/dist/input.js';
import {
  dispatchWindowsLabTone,
  windowsLabToneCommand,
} from '../../scripts/windows-lab-tone.mjs';

const target = { host: '192.168.21.149', port: 3389 };

test('combined MVP tone retains the fixed in-memory source and a bounded 33-minute lifetime', () => {
  const command = windowsLabToneCommand(1980);
  assert.equal(
    command,
    windowsLabToneCommand(180).replace('Seconds 180', 'Seconds 1980'),
  );
  assert.ok(Buffer.byteLength(command, 'utf16le') + 2 <= 2048);
  for (const duration of [1800, 1979, 1981, '1980'])
    assert.throws(
      () => windowsLabToneCommand(duration),
      /LAB_TONE_DURATION_REFUSED/,
    );
});

test('three-minute tone changes only its finite duration and refuses other values before input', async () => {
  assert.ok(
    Buffer.byteLength(windowsLabToneCommand(180), 'utf16le') + 2 <= 2048,
  );
  assert.equal(
    windowsLabToneCommand(180),
    windowsLabToneCommand().replace(
      'Start-Sleep -Seconds 45',
      'Start-Sleep -Seconds 180',
    ),
  );
  let calls = 0;
  for (const duration of [0, -1, 46, 179, 181, Infinity, '180', null])
    await assert.rejects(
      dispatchWindowsLabTone(
        async () => {
          ++calls;
        },
        target,
        async () => {},
        duration,
      ),
      { message: 'LAB_TONE_DURATION_REFUSED' },
    );
  assert.equal(calls, 0);
  const chunks = [];
  await dispatchWindowsLabTone(
    async (event) => {
      if (event.type === 'text') chunks.push(event.text);
    },
    target,
    async () => {},
    180,
  );
  assert.equal(chunks.slice(1).join(''), windowsLabToneCommand(180));
});

test('explicit Windows tone uses bounded private text records and releases every held key', async () => {
  const events = [];
  const waits = [];
  await dispatchWindowsLabTone(
    async (event) => {
      events.push(event);
    },
    target,
    async (ms) => {
      waits.push(ms);
    },
  );
  const text = events.filter((event) => event.type === 'text');
  assert.equal(text[0].text, 'powershell -NoProfile');
  assert.equal(
    text
      .slice(1)
      .map((event) => event.text)
      .join(''),
    windowsLabToneCommand(),
  );
  for (const event of text)
    assert.ok(encodeInputText(event.text).length <= 512);
  assert.deepEqual(waits.slice(0, 2), [500, 2000]);
  assert.ok(waits.slice(2).every((ms) => ms === 300));
  const held = new Set();
  for (const event of events) {
    if (event.type === 'reset') held.clear();
    else if (event.type === 'key') {
      if (event.down) {
        assert.ok(!held.has(event.scancode));
        held.add(event.scancode);
      } else {
        assert.ok(held.delete(event.scancode));
      }
    }
  }
  assert.equal(held.size, 0);
  assert.equal(
    events.filter(
      (event) =>
        event.type === 'key' &&
        event.scancode === physicalScancode('Enter') &&
        event.down,
    ).length,
    2,
  );
  assert.equal(events.at(-1).type, 'reset');
});

test('Windows tone target refusal precedes input; failed dispatch retires held state without disclosing its cause', async () => {
  let calls = 0;
  for (const target of [
    undefined,
    {},
    { host: 'other' },
    { host: '192.168.21.149', port: 3390 },
  ])
    await assert.rejects(
      dispatchWindowsLabTone(async () => {
        ++calls;
      }, target),
      { message: 'LAB_TONE_TARGET_REFUSED' },
    );
  assert.equal(calls, 0);
  const events = [];
  await assert.rejects(
    dispatchWindowsLabTone(
      async (event) => {
        events.push(event);
        if (events.length === 3) throw new Error('private synthetic reason');
      },
      target,
      async () => {},
    ),
    { message: 'LAB_TONE_INPUT_FAILED' },
  );
  assert.equal(events.at(-1).type, 'reset');
});

test('fixed tone WAV header describes one second of quiet 8 kHz mono PCM and a finite remote owner', () => {
  const command = windowsLabToneCommand();
  const header = Buffer.from(
    command.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)[1],
    'base64',
  );
  assert.equal(header.length, 44);
  assert.equal(header.toString('ascii', 0, 4), 'RIFF');
  assert.equal(header.readUInt32LE(4), 8036);
  assert.equal(header.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(header.readUInt16LE(20), 1);
  assert.equal(header.readUInt16LE(22), 1);
  assert.equal(header.readUInt32LE(24), 8000);
  assert.equal(header.readUInt32LE(28), 8000);
  assert.equal(header.readUInt16LE(32), 1);
  assert.equal(header.readUInt16LE(34), 8);
  assert.equal(header.toString('ascii', 36, 40), 'data');
  assert.equal(header.readUInt32LE(40), 8000);
  assert.match(command, /PlayLooping\(\);Start-Sleep -Seconds 45/);
  assert.match(command, /finally\{.*\.Stop\(\);.*\.Dispose\(\).*;exit\}/);
});

test(
  'Windows PowerShell parses the fixed lab tone without executing it',
  { skip: process.platform !== 'win32' },
  () => {
    const parse =
      "$text=[Console]::In.ReadToEnd();$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors);if($errors.Count){exit 1};'PARSE_OK'";
    for (const duration of [45, 180])
      assert.equal(
        execFileSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', parse],
          {
            input: windowsLabToneCommand(duration),
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5000,
          },
        ).trim(),
        'PARSE_OK',
      );
  },
);
