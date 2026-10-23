import { verifyLinuxRuntime } from './linux-runtime.mjs';

if (process.argv.length !== 3)
  throw new Error('Expected one private Linux staging directory');
console.log(JSON.stringify(await verifyLinuxRuntime(process.argv[2])));
