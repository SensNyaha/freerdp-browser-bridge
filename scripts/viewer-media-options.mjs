/** Local viewer modes; input and output codec choices are independent. */
export function viewerMediaOptions(flag) {
  const tonePreview = flag === '--audio-opus-compat-tone-listen';
  const listenPreview = flag === '--audio-opus-compat-listen' || tonePreview;
  const audioRecoveryTest = [
    '--audio-compat-recovery-test',
    '--audio-opus-compat-recovery-test',
  ].includes(flag);
  const compatibility = [
    '--audio-compat-manual',
    '--audio-compat-test',
    '--audio-opus-compat-manual',
    '--audio-opus-compat-test',
    '--audio-opus-compat-listen',
    '--audio-opus-compat-tone-listen',
    '--audio-compat-recovery-test',
    '--audio-opus-compat-recovery-test',
  ].includes(flag);
  const opusInput = [
    '--microphone-opus-input-manual',
    '--microphone-opus-input-test',
  ].includes(flag);
  const microphoneManual = [
    '--microphone-manual',
    '--microphone-pcm-manual',
    '--microphone-opus-manual',
    '--microphone-opus-input-manual',
  ].includes(flag);
  const microphoneTest = [
    '--microphone-test',
    '--microphone-opus-input-test',
  ].includes(flag);
  const audioManual = [
    '--audio-opus-compat-listen',
    '--audio-opus-compat-tone-listen',
    '--audio-compat-manual',
    '--audio-opus-compat-manual',
    '--audio-manual',
    '--audio-opus-manual',
    '--microphone-pcm-manual',
    '--microphone-opus-manual',
  ].includes(flag);
  const audioTest = [
    '--audio-compat-recovery-test',
    '--audio-opus-compat-recovery-test',
    '--audio-test',
    '--audio-opus-test',
    '--audio-compat-test',
    '--audio-opus-compat-test',
  ].includes(flag);
  const audioOutput = [
    '--audio-opus-compat-recovery-test',
    '--audio-opus-compat-listen',
    '--audio-opus-compat-tone-listen',
    '--audio-opus-compat-manual',
    '--audio-opus-compat-test',
    '--audio-opus-manual',
    '--audio-opus-test',
    '--microphone-opus-manual',
  ].includes(flag)
    ? 'opus'
    : audioManual || audioTest
      ? 'pcm'
      : 'off';
  return {
    microphoneManual,
    microphoneTest,
    microphone:
      microphoneManual || microphoneTest ? (opusInput ? 'opus' : 'pcm') : 'off',
    audioManual,
    audioTest,
    audioOutput,
    ...(compatibility ? { audioOutputBufferMs: 200 } : {}),
    ...(listenPreview ? { listenPreview: true } : {}),
    ...(tonePreview ? { tonePreview: true } : {}),
    ...(audioRecoveryTest ? { audioRecoveryTest: true } : {}),
    manual: flag === '--manual' || audioManual || microphoneManual,
  };
}
