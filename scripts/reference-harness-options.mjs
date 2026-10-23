const usage =
  'Run the local Windows reference harness with optional --smoke and --native-receipt build/native-clean-ID/receipt.json';

export function parseReferenceHarnessOptions(args) {
  if (!Array.isArray(args)) throw new Error(usage);
  let smoke = false;
  let receipt;
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === '--smoke' && !smoke) {
      smoke = true;
      continue;
    }
    if (value === '--native-receipt' && receipt === undefined) {
      receipt = args[++index];
      if (
        typeof receipt !== 'string' ||
        !/^build[\\/]native-clean-[A-Za-z0-9_-]+[\\/]receipt\.json$/.test(
          receipt,
        )
      )
        throw new Error(usage);
      continue;
    }
    throw new Error(usage);
  }
  return { smoke, receipt };
}
