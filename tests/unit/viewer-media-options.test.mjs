import test from 'node:test';
import assert from 'node:assert/strict';
import { viewerMediaOptions } from '../../scripts/viewer-media-options.mjs';

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
