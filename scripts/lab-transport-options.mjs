export function labTransportOptions(args) {
  const values = [...args];
  const framed = values.at(-1) === '--framed';
  if (framed) values.pop();
  const [mode = 'strict', fingerprint, ...extra] = values;
  if (
    extra.length ||
    !['strict', 'connect', 'loss'].includes(mode) ||
    (mode === 'strict'
      ? fingerprint !== undefined
      : !/^sha256:[a-f0-9]{64}$/.test(fingerprint ?? ''))
  )
    throw new Error(
      'Use strict or connect/loss approved fingerprint, optional --framed',
    );
  return {
    mode,
    fingerprint,
    framed,
    ipcTransport: framed ? 'framed-pipes' : 'auto',
  };
}
