/** Local viewer modes; input and output codec choices are independent. */
export function viewerMediaOptions(flag) {
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
    '--audio-manual',
    '--audio-opus-manual',
    '--microphone-pcm-manual',
    '--microphone-opus-manual',
  ].includes(flag);
  const audioTest = ['--audio-test', '--audio-opus-test'].includes(flag);
  const audioOutput = [
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
    manual: flag === '--manual' || audioManual || microphoneManual,
  };
}
