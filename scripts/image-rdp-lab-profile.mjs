/** Only an operator-prepared owned document; no remote app/URL launch path. */
export function imageRdpLabArguments(args) {
  const invalid = () => new Error('IMAGE_RDP_LAB_ARGUMENTS_INVALID');
  if (
    !Array.isArray(args) ||
    ![4, 5].includes(args.length) ||
    !args.every((x) => typeof x === 'string')
  )
    throw invalid();
  const [prepared, owned, fingerprint, receipt, keep] = args;
  const document = /^--prepared-remote-document=([0-9a-f]{32})$/.exec(prepared);
  if (
    !document ||
    owned !== '--owned-os-clipboard' ||
    !/^sha256:[0-9a-f]{64}$/.test(fingerprint) ||
    !/^build[\\/]native-clean-[A-Za-z0-9_-]+[\\/]receipt\.json$/.test(
      receipt,
    ) ||
    (args.length === 5 && keep !== '--keep-remote-document')
  )
    throw invalid();
  return {
    nonce: document[1],
    fingerprint,
    receipt,
    keepRemoteDocument: args.length === 5,
  };
}
