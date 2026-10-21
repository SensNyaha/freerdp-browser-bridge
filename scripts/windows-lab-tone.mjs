import { setTimeout as delay } from 'node:timers/promises';
import {
  physicalScancode,
  MAX_TEXT_UNITS,
} from '../packages/protocol/dist/input.js';

// Fixed, quiet 440 Hz / PCM8 mono source in memory. No remote file or download.
// This explicit lab mode is separate from ordinary idle-source acceptance.
export function windowsLabToneCommand(durationSeconds = 45) {
  if (durationSeconds !== 45 && durationSeconds !== 180)
    throw new Error('LAB_TONE_DURATION_REFUSED');
  return (
    '$bridgeToneStream=$null;$bridgeTonePlayer=$null;try{' +
    "$ErrorActionPreference='Stop';" +
    "$bridgeToneHeader=[Convert]::FromBase64String('UklGRmQfAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAfAAA=');" +
    '$bridgeToneBytes=[byte[]]::new(8044);[Array]::Copy($bridgeToneHeader,$bridgeToneBytes,44);' +
    'for($i=0;$i-lt8000;$i++){$bridgeToneBytes[$i+44]=128+[int](6*[Math]::Sin(2*[Math]::PI*440*$i/8000))};' +
    '$bridgeToneStream=[IO.MemoryStream]::new($bridgeToneBytes);' +
    '$bridgeTonePlayer=[Media.SoundPlayer]::new($bridgeToneStream);' +
    '$bridgeTonePlayer.PlayLooping();Start-Sleep -Seconds ' +
    durationSeconds +
    '}finally{if($bridgeTonePlayer){$bridgeTonePlayer.Stop();$bridgeTonePlayer.Dispose()};' +
    'if($bridgeToneStream){$bridgeToneStream.Dispose()};exit}'
  );
}

/** Explicitly authorized Windows lab only; command delivery is not execution/readback proof. */
export async function dispatchWindowsLabTone(
  sendInput,
  target,
  pause = delay,
  durationSeconds = 45,
) {
  if (target?.host !== '192.168.21.149' || (target.port ?? 3389) !== 3389)
    throw new Error('LAB_TONE_TARGET_REFUSED');
  const command = windowsLabToneCommand(durationSeconds);
  const key = async (code, down) =>
    sendInput({
      type: 'key',
      scancode: physicalScancode(code),
      down,
      repeat: false,
    });
  const chord = async (...codes) => {
    for (const code of codes) await key(code, true);
    for (const code of [...codes].reverse()) await key(code, false);
  };
  try {
    await sendInput({ type: 'reset' });
    await chord('MetaLeft', 'KeyR');
    await pause(500);
    await chord('ControlLeft', 'KeyA');
    await sendInput({ type: 'text', text: 'powershell -NoProfile' });
    await chord('Enter');
    await pause(2000);
    for (let offset = 0; offset < command.length; offset += MAX_TEXT_UNITS) {
      await sendInput({
        type: 'text',
        text: command.slice(offset, offset + MAX_TEXT_UNITS),
      });
      await pause(300);
    }
    await chord('Enter');
  } catch {
    throw new Error('LAB_TONE_INPUT_FAILED');
  } finally {
    await sendInput({ type: 'reset' }).catch(() => {});
  }
}
