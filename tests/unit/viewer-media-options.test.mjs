import test from 'node:test';
import assert from 'node:assert/strict';
import { viewerMediaOptions } from '../../scripts/viewer-media-options.mjs';
test('manual audio source keeps the existing listening mode, with no automatic tone dispatch', () => {
  assert.deepEqual(viewerMediaOptions('--audio-opus-compat-source-listen'), {
    ...viewerMediaOptions('--audio-opus-compat-listen'),
    manualSource: true,
    previewDurationMs: 300000,
  });
});
test('bounded three-minute tone uses the existing Opus/200 ms listening mode with microphone off', () => {
  assert.deepEqual(viewerMediaOptions('--audio-opus-compat-tone-soak'), {
    ...viewerMediaOptions('--audio-opus-compat-listen'),
    manualSource: true,
    previewDurationMs: 300000,
  });
});
test('compatibility viewer selects exactly 200 ms output without microphone capture', () => {
  for (const [flag, codec, manual] of [
    ['--audio-compat-test', 'pcm', false],
    ['--audio-compat-manual', 'pcm', true],
    ['--audio-opus-compat-test', 'opus', false],
    ['--audio-opus-compat-manual', 'opus', true],
    ['--audio-opus-compat-listen', 'opus', true],
    ['--audio-opus-compat-tone-listen', 'opus', true],
    ['--audio-compat-recovery-test', 'pcm', false],
    ['--audio-opus-compat-recovery-test', 'opus', false],
  ]) {
    const value = viewerMediaOptions(flag);
    assert.equal(value.audioOutputBufferMs, 200);
    assert.equal(value.audioOutput, codec);
    assert.equal(value.manual, manual);
    assert.equal(value.microphone, 'off');
  }
  assert.equal(
    viewerMediaOptions('--audio-opus-test').audioOutputBufferMs,
    undefined,
  );
  for (const flag of [
    '--audio-compat-recovery-test',
    '--audio-opus-compat-recovery-test',
  ]) {
    assert.equal(viewerMediaOptions(flag).audioRecoveryTest, true);
    assert.equal(viewerMediaOptions(flag).audioTest, true);
  }
  assert.equal(
    viewerMediaOptions('--audio-opus-test').audioRecoveryTest,
    undefined,
  );
  assert.equal(
    viewerMediaOptions('--audio-opus-compat-tone-listen').tonePreview,
    true,
  );
  assert.equal(
    viewerMediaOptions('--audio-opus-compat-tone-listen').listenPreview,
    true,
  );
  assert.equal(
    viewerMediaOptions('--audio-opus-compat-listen').tonePreview,
    undefined,
  );
});

test('lab viewer options: explicit Opus input remains independent of output and automated capture stays disabled', () => {
  for (const [flag, manual] of [
    ['--microphone-opus-input-test', false],
    ['--microphone-opus-input-manual', true],
  ]) {
    const value = viewerMediaOptions(flag);
    assert.equal(value.microphone, 'opus');
    assert.equal(value.audioOutput, 'off');
    assert.equal(value.manual, manual);
    assert.equal(value.microphoneTest, !manual);
    assert.equal(value.microphoneManual, manual);
    assert.equal(value.audioManual, false);
    assert.equal(value.audioTest, false);
  }
});
test('lab viewer options: existing Opus-output/PCM-input and desktop modes keep their original meaning', () => {
  for (const [flag, microphone, audioOutput, manual] of [
    ['--microphone-opus-manual', 'pcm', 'opus', true],
    ['--microphone-pcm-manual', 'pcm', 'pcm', true],
    ['--microphone-manual', 'pcm', 'off', true],
    ['--microphone-test', 'pcm', 'off', false],
    ['--audio-opus-test', 'off', 'opus', false],
    ['--audio-opus-manual', 'off', 'opus', true],
    ['--audio-test', 'off', 'pcm', false],
    ['--audio-manual', 'off', 'pcm', true],
    ['--manual', 'off', 'off', true],
    ['--quality-test', 'off', 'off', false],
    [undefined, 'off', 'off', false],
  ]) {
    const value = viewerMediaOptions(flag);
    assert.equal(value.microphone, microphone, flag);
    assert.equal(value.audioOutput, audioOutput, flag);
    assert.equal(value.manual, manual, flag);
  }
});
