import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ownedLabDefinition } from './viewer-lab-files.mjs';

// Explicitly owned local fixture. No external RDP host or personal VM is changed.
const unicodeServer =
  process.argv.length === 3 && process.argv[2] === '--unicode-server';
const definition = ownedLabDefinition(
  unicodeServer ? 'owned-unicode-container' : 'owned-container',
);
const container = definition.container;
const image = definition.image;
const files = [
  '.local-tests/' + definition.stem + '.json',
  '.local-tests/' + definition.stem + '.secrets.json',
  '.local-tests/' + definition.receipt,
];
const command = (args, input, timeout = 30000) => {
  const result = spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error('OWNED_LAB_OPERATION_FAILED');
  return result.stdout.trim();
};
let created;
const written = [];
try {
  if (process.argv.length !== 2 && !unicodeServer)
    throw new Error('OWNED_LAB_ARGUMENTS_REFUSED');
  for (const path of files) {
    const exists = await access(path).then(
      () => true,
      (error) => {
        if (error.code === 'ENOENT') return false;
        throw new Error('OWNED_LAB_FILES_UNAVAILABLE');
      },
    );
    if (exists) throw new Error('OWNED_LAB_EXISTING_FILES_REFUSED');
  }
  const ignored = spawnSync('git', ['check-ignore', '--', ...files], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (ignored.status !== 0 || ignored.stdout.trim().split(/\r?\n/).length !== 3)
    throw new Error('OWNED_LAB_IGNORE_REQUIRED');
  command(
    [
      'build',
      '--file',
      definition.dockerfile,
      '--tag',
      image,
      'tests/fixtures/xrdp-lab',
    ],
    undefined,
    600000,
  );
  const identity = JSON.parse(command(['image', 'inspect', image]))[0].Id;
  if (!/^sha256:[0-9a-f]{64}$/.test(identity))
    throw new Error('OWNED_LAB_IMAGE_INVALID');
  created = command([
    'run',
    '--detach',
    '--name',
    container,
    '--label',
    'freerdp-bridge.owned-lab=' + definition.label,
    '--init',
    '--publish',
    '127.0.0.1:' + definition.port + ':3389',
    '--cpus',
    '2',
    '--memory',
    '2g',
    '--pids-limit',
    '256',
    '--shm-size',
    '128m',
    '--security-opt',
    'no-new-privileges',
    identity,
  ]);
  if (!/^[0-9a-f]{64}$/.test(created)) throw new Error('OWNED_LAB_ID_INVALID');
  const password = randomBytes(24).toString('base64url');
  const input = Buffer.from(
    'bridge-lab:' + password + '\nbridge-lab-2:' + password + '\n',
  );
  try {
    command(['exec', '-i', created, 'chpasswd'], input);
  } finally {
    input.fill(0);
  }
  command([
    'exec',
    created,
    'rm',
    '-f',
    '/etc/xrdp/key.pem',
    '/etc/xrdp/cert.pem',
  ]);
  command([
    'exec',
    created,
    'openssl',
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '2',
    '-subj',
    '/CN=bridge-owned-xrdp',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
    '-keyout',
    '/etc/xrdp/key.pem',
    '-out',
    '/etc/xrdp/cert.pem',
  ]);
  command(['exec', created, 'chown', 'root:ssl-cert', '/etc/xrdp/key.pem']);
  command(['exec', created, 'chmod', '640', '/etc/xrdp/key.pem']);
  command(['exec', created, 'chmod', '644', '/etc/xrdp/cert.pem']);
  const certificate = command([
    'exec',
    created,
    'openssl',
    'x509',
    '-in',
    '/etc/xrdp/cert.pem',
    '-noout',
    '-fingerprint',
    '-sha256',
  ]);
  const hex = certificate.split('=').at(-1).replaceAll(':', '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex))
    throw new Error('OWNED_LAB_CERTIFICATE_INVALID');
  command(['exec', created, '/usr/sbin/xrdp-sesman']);
  command(['exec', created, '/usr/sbin/xrdp']);
  const inspected = JSON.parse(command(['container', 'inspect', created]))[0];
  const ports = inspected.NetworkSettings.Ports['3389/tcp'];
  if (
    ports?.length !== 1 ||
    ports[0].HostIp !== '127.0.0.1' ||
    ports[0].HostPort !== String(definition.port) ||
    inspected.Mounts.length !== 0
  )
    throw new Error('OWNED_LAB_SCOPE_INVALID');
  const versions = command([
    'exec',
    created,
    'dpkg-query',
    '--show',
    '--showformat=${Package}=${Version}\n',
    'xrdp',
    'xorgxrdp',
    'openbox',
    'python3-tk',
  ]).split('\n');
  const receipt = {
    v: 1,
    container: created,
    image: identity,
    host: '127.0.0.1',
    port: definition.port,
    fingerprint: 'sha256:' + hex,
    versions,
    cpus: 2,
    memoryBytes: 2147483648,
    pids: 256,
    hostMounts: 0,
  };
  await mkdir(resolve('.local-tests'), { recursive: true });
  const json = async (path, data) => {
    await writeFile(path, JSON.stringify(data, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    written.push(path);
  };
  await json(files[1], { username: 'bridge-lab', password });
  await json(files[0], {
    host: '127.0.0.1',
    port: definition.port,
    purpose: 'User-authorized owned Linux XRDP fixture',
    credentialFile: definition.stem + '.secrets.json',
  });
  await json(files[2], receipt);
  console.log(JSON.stringify(receipt));
} catch (error) {
  if (created && /^[0-9a-f]{64}$/.test(created))
    spawnSync('docker', ['rm', '--force', created], {
      timeout: 30000,
      stdio: 'ignore',
      windowsHide: true,
    });
  for (const path of written) await rm(path, { force: true });
  console.error(
    /^OWNED_LAB_[A-Z_]+$/.test(error.message)
      ? error.message
      : 'OWNED_LAB_SETUP_FAILED',
  );
  process.exitCode = 1;
}
